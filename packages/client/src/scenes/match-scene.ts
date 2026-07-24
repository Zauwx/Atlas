import Phaser from "phaser";
import type {
  GameConfig,
  GameEvent,
  GameEventBatch,
  IntentAckMessage,
  IntentRejection,
  MatchEndedMessage,
  MatchSnapshot,
  PlayerConnectionMessage,
  PlayerId,
  SpellId,
  UnitId,
} from "@atlas/shared";
import { hasLineOfSightOverHeights } from "@atlas/engine";
import type { MatchConnection } from "../net/connection.js";
import type { MatchSession, SessionSink } from "../net/match-session.js";
import { MatchView, type UnitView } from "../state/match-view.js";
import { reachableCells, suggestPath } from "../state/path-suggester.js";
import { depthOf, isoX, isoY, pickCell, TILE_HEIGHT, TILE_WIDTH, Z_STEP } from "../render/iso.js";
import { colorForPlayer, colorForTerrain, shade } from "../render/palette.js";
import { Hud } from "../ui/hud.js";

/**
 * The match scene: pure event playback (ARCHITECTURE.md "Client Rendering
 * Decisions"). Renders the view state, animates one server event at a
 * time, and converts input into intents. No gameplay decisions are made
 * here — a click only ever produces a proposal for the server.
 */

export interface MatchSceneData {
  session: MatchSession;
  connection: MatchConnection;
  config: GameConfig;
  snapshot: MatchSnapshot;
  playerId: PlayerId;
}

interface UnitVisual {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  healthBar: Phaser.GameObjects.Graphics;
}

const MOVE_MS_PER_CELL = 140;

export class MatchScene extends Phaser.Scene implements SessionSink {
  private connection!: MatchConnection;
  private session!: MatchSession;
  private view!: MatchView;
  private myPlayerId!: PlayerId;

  private boardLayer!: Phaser.GameObjects.Container;
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private highlightGraphics!: Phaser.GameObjects.Graphics;
  private readonly unitVisuals = new Map<UnitId, UnitVisual>();
  private hud!: Hud;

  private readonly eventQueue: GameEvent[] = [];
  private animating = false;
  private selectedSpellId: SpellId | null = null;
  private stanceLocked = false;
  private matchOver = false;

  constructor() {
    super("match");
  }

  init(data: MatchSceneData): void {
    this.session = data.session;
    this.connection = data.connection;
    this.myPlayerId = data.playerId;
    this.view = new MatchView(data.config);
    this.view.loadSnapshot(data.snapshot);
  }

  create(): void {
    const boardPixelCenterX = isoX(this.view.width - 1, 0) / 2 + isoX(0, this.view.height - 1) / 2;
    const boardPixelCenterY = isoY(this.view.width - 1, this.view.height - 1, 0) / 2;
    this.boardLayer = this.add.container(
      this.scale.width / 2 - boardPixelCenterX,
      this.scale.height / 2 - boardPixelCenterY - 30,
    );
    this.boardGraphics = this.add.graphics();
    this.highlightGraphics = this.add.graphics();
    this.boardLayer.add(this.boardGraphics);
    this.boardLayer.add(this.highlightGraphics);

    this.drawBoard();
    for (const unit of this.view.units) {
      this.createUnitVisual(unit);
    }

    const myUnit = this.view.units.find((unit) => unit.playerId === this.myPlayerId);
    const myClass = myUnit === null || myUnit === undefined ? null : this.view.classOf(myUnit);
    this.hud = new Hud(this, this.view.config, {
      onEndTurn: () => {
        this.sendEndTurn();
      },
      onSpellToggled: (spellId) => {
        this.selectedSpellId = this.selectedSpellId === spellId ? null : spellId;
        this.refreshIdleUi();
      },
      onStanceChosen: (stanceId) => {
        this.connection.sendIntent({ type: "ChooseStance", stanceId });
      },
    });
    this.hud.build(myClass?.spellIds ?? []);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.handlePointerDown(pointer);
    });

    this.session.attach(this);
    this.refreshIdleUi();
  }

  // --- SessionSink ---

  enqueueEvents(events: GameEventBatch): void {
    this.eventQueue.push(...events);
    this.processNextEvent();
  }

  onAck(ack: IntentAckMessage): void {
    if (ack.intentType === "ChooseStance") {
      this.stanceLocked = true;
    }
    if (ack.intentType === "CastSpell" && this.selectedSpellId !== null) {
      const myUnit = this.myActiveUnit();
      if (myUnit !== null) {
        this.view.noteSpellCast(myUnit.id, this.selectedSpellId);
      }
      this.selectedSpellId = null;
    }
    this.refreshIdleUi();
  }

  onRejection(rejection: IntentRejection): void {
    this.hud.showMessage(`Rejected: ${rejection.code}`);
  }

  onPlayerConnection(message: PlayerConnectionMessage): void {
    this.hud.showMessage(
      message.playerId === this.myPlayerId
        ? "Reconnected."
        : message.connected
          ? "Opponent reconnected."
          : "Opponent disconnected…",
    );
  }

  onMatchEnded(message: MatchEndedMessage): void {
    this.matchOver = true;
    const outcome =
      message.winnerPlayerId === null
        ? "Draw"
        : message.winnerPlayerId === this.myPlayerId
          ? "Victory!"
          : "Defeat";
    this.hud.showBanner(message.reason === "Forfeit" ? `${outcome} (forfeit)` : outcome);
  }

  onResync(snapshot: MatchSnapshot): void {
    // Authoritative correction: rebuild the whole visual state.
    this.eventQueue.length = 0;
    this.animating = false;
    this.view.loadSnapshot(snapshot);
    this.drawBoard();
    for (const visual of this.unitVisuals.values()) {
      visual.container.destroy();
    }
    this.unitVisuals.clear();
    for (const unit of this.view.units) {
      this.createUnitVisual(unit);
    }
    this.refreshIdleUi();
  }

  // --- Event playback ---

  private processNextEvent(): void {
    if (this.animating) {
      return;
    }
    const event = this.eventQueue.shift();
    if (event === undefined) {
      this.refreshIdleUi();
      return;
    }
    this.animating = true;
    this.view.apply(event);
    this.animateEvent(event, () => {
      this.animating = false;
      this.processNextEvent();
    });
  }

  private animateEvent(event: GameEvent, done: () => void): void {
    switch (event.type) {
      case "Move": {
        this.tweenAlongPath(
          event.unitId,
          event.path.map((step) => ({ ...step })),
          done,
        );
        return;
      }
      case "Push": {
        this.tweenAlongPath(event.unitId, [{ ...event.to }], done);
        return;
      }
      case "Fall": {
        this.tweenAlongPath(event.unitId, [{ ...event.to }], () => {
          if (event.damage > 0) {
            this.floatText(
              event.to.x,
              event.to.y,
              event.to.z,
              `-${String(event.damage)}`,
              "#ff8a5e",
            );
          }
          this.syncUnitVisual(event.unitId);
          done();
        });
        return;
      }
      case "Collision": {
        this.floatText(event.at.x, event.at.y, event.at.z, `-${String(event.damage)}`, "#ff8a5e");
        this.syncUnitVisual(event.unitId);
        this.time.delayedCall(250, done);
        return;
      }
      case "Damage": {
        const unit = this.view.unitById(event.targetUnitId);
        if (unit !== null) {
          this.floatText(
            unit.position.x,
            unit.position.y,
            unit.position.z,
            `-${String(event.amount)}`,
            "#ff6a6a",
          );
        }
        this.syncUnitVisual(event.targetUnitId);
        this.time.delayedCall(250, done);
        return;
      }
      case "Heal": {
        const unit = this.view.unitById(event.targetUnitId);
        if (unit !== null) {
          this.floatText(
            unit.position.x,
            unit.position.y,
            unit.position.z,
            `+${String(event.amount)}`,
            "#7dff9a",
          );
        }
        this.syncUnitVisual(event.targetUnitId);
        this.time.delayedCall(250, done);
        return;
      }
      case "Death": {
        const visual = this.unitVisuals.get(event.unitId);
        if (visual === undefined) {
          done();
          return;
        }
        this.tweens.add({
          targets: visual.container,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            visual.container.destroy();
            this.unitVisuals.delete(event.unitId);
            done();
          },
        });
        return;
      }
      case "TerrainChanged": {
        this.drawBoard();
        this.time.delayedCall(150, done);
        return;
      }
      case "StanceRevealed": {
        const stanceName =
          this.view.config.stances.find((stance) => stance.id === event.stanceId)?.name ??
          event.stanceId;
        this.hud.showMessage(
          event.playerId === this.myPlayerId
            ? `You revealed ${stanceName}.`
            : `Opponent revealed ${stanceName}!`,
        );
        this.time.delayedCall(200, done);
        return;
      }
      case "RoundStarted": {
        this.stanceLocked = false;
        this.selectedSpellId = null;
        this.time.delayedCall(100, done);
        return;
      }
      case "Victory": {
        done();
        return;
      }
      case "ApplyState":
      case "RemoveState":
      case "TurnStarted":
      case "TurnEnded": {
        this.time.delayedCall(60, done);
        return;
      }
    }
  }

  // --- Input ---

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.matchOver || this.animating || this.eventQueue.length > 0) {
      return;
    }
    const myUnit = this.myActiveUnit();
    if (myUnit === null) {
      return;
    }
    const localX = pointer.x - this.boardLayer.x;
    const localY = pointer.y - this.boardLayer.y;
    const cell = pickCell(this.view.cells, localX, localY);
    if (cell === null) {
      return;
    }

    if (this.selectedSpellId !== null) {
      this.connection.sendIntent({
        type: "CastSpell",
        unitId: myUnit.id,
        spellId: this.selectedSpellId,
        target: { x: cell.x, y: cell.y, z: cell.z },
      });
      return;
    }

    const path = suggestPath(this.view, myUnit, cell.x, cell.y);
    if (path !== null) {
      this.connection.sendIntent({ type: "Move", unitId: myUnit.id, path });
    }
  }

  private sendEndTurn(): void {
    const myUnit = this.myActiveUnit();
    if (myUnit !== null) {
      this.connection.sendIntent({ type: "EndTurn", unitId: myUnit.id });
    }
  }

  private myActiveUnit(): UnitView | null {
    if (this.view.activeUnitId === null) {
      return null;
    }
    const unit = this.view.unitById(this.view.activeUnitId);
    return unit !== null && unit.playerId === this.myPlayerId && unit.alive ? unit : null;
  }

  // --- Rendering ---

  private drawBoard(): void {
    const graphics = this.boardGraphics;
    graphics.clear();
    const sorted = [...this.view.cells].sort(
      (a, b) => depthOf(a.x, a.y, a.z) - depthOf(b.x, b.y, b.z),
    );
    for (const cell of sorted) {
      const topColor = colorForTerrain(cell.terrainId);
      const centerX = isoX(cell.x, cell.y);
      const centerY = isoY(cell.x, cell.y, cell.z);
      const halfW = TILE_WIDTH / 2;
      const halfH = TILE_HEIGHT / 2;
      const sideHeight = cell.z * Z_STEP;

      if (sideHeight > 0) {
        // Left side face.
        graphics.fillStyle(shade(topColor, 0.55));
        graphics.fillPoints(
          [
            { x: centerX - halfW, y: centerY },
            { x: centerX, y: centerY + halfH },
            { x: centerX, y: centerY + halfH + sideHeight },
            { x: centerX - halfW, y: centerY + sideHeight },
          ],
          true,
        );
        // Right side face.
        graphics.fillStyle(shade(topColor, 0.4));
        graphics.fillPoints(
          [
            { x: centerX + halfW, y: centerY },
            { x: centerX, y: centerY + halfH },
            { x: centerX, y: centerY + halfH + sideHeight },
            { x: centerX + halfW, y: centerY + sideHeight },
          ],
          true,
        );
      }

      graphics.fillStyle(topColor);
      graphics.fillPoints(
        [
          { x: centerX, y: centerY - halfH },
          { x: centerX + halfW, y: centerY },
          { x: centerX, y: centerY + halfH },
          { x: centerX - halfW, y: centerY },
        ],
        true,
      );
      graphics.lineStyle(1, 0x0e1420, 0.35);
      graphics.strokePoints(
        [
          { x: centerX, y: centerY - halfH },
          { x: centerX + halfW, y: centerY },
          { x: centerX, y: centerY + halfH },
          { x: centerX - halfW, y: centerY },
          { x: centerX, y: centerY - halfH },
        ],
        false,
      );
    }
  }

  private createUnitVisual(unit: UnitView): void {
    // Blue = me, red = opponent, regardless of join order.
    const ownerIndex = unit.playerId === this.myPlayerId ? 0 : 1;
    const body = this.add.circle(0, -10, 12, colorForPlayer(ownerIndex));
    body.setStrokeStyle(2, 0x0e1420);
    const healthBar = this.add.graphics();
    const container = this.add.container(
      isoX(unit.position.x, unit.position.y),
      isoY(unit.position.x, unit.position.y, unit.position.z),
      [body, healthBar],
    );
    this.boardLayer.add(container);
    container.setDepth(depthOf(unit.position.x, unit.position.y, unit.position.z) + 8);
    this.unitVisuals.set(unit.id, { container, body, healthBar });
    this.redrawHealthBar(unit);
  }

  private redrawHealthBar(unit: UnitView): void {
    const visual = this.unitVisuals.get(unit.id);
    if (visual === undefined) {
      return;
    }
    const graphics = visual.healthBar;
    graphics.clear();
    const ratio = Math.max(0, unit.healthPoints / unit.maxHealthPoints);
    graphics.fillStyle(0x0e1420, 0.8);
    graphics.fillRect(-16, -30, 32, 5);
    graphics.fillStyle(ratio > 0.5 ? 0x7dff9a : ratio > 0.25 ? 0xffd27a : 0xff6a6a);
    graphics.fillRect(-15, -29, 30 * ratio, 3);
  }

  private syncUnitVisual(unitId: UnitId): void {
    const unit = this.view.unitById(unitId);
    if (unit !== null) {
      this.redrawHealthBar(unit);
    }
  }

  private tweenAlongPath(
    unitId: UnitId,
    path: { x: number; y: number; z: number }[],
    done: () => void,
  ): void {
    const visual = this.unitVisuals.get(unitId);
    if (visual === undefined || path.length === 0) {
      done();
      return;
    }
    let index = 0;
    const step = (): void => {
      const target = path[index];
      if (target === undefined) {
        this.syncUnitVisual(unitId);
        done();
        return;
      }
      visual.container.setDepth(depthOf(target.x, target.y, target.z) + 8);
      this.tweens.add({
        targets: visual.container,
        x: isoX(target.x, target.y),
        y: isoY(target.x, target.y, target.z),
        duration: MOVE_MS_PER_CELL,
        onComplete: () => {
          index += 1;
          step();
        },
      });
    };
    step();
  }

  private refreshIdleUi(): void {
    const myUnit = this.view.units.find((unit) => unit.playerId === this.myPlayerId && unit.alive);
    this.hud.update(
      this.view,
      this.myPlayerId,
      myUnit ?? null,
      this.selectedSpellId,
      this.stanceLocked,
    );

    this.highlightGraphics.clear();
    const activeUnit = this.myActiveUnit();
    if (activeUnit === null || this.matchOver) {
      return;
    }

    if (this.selectedSpellId === null) {
      for (const reachable of reachableCells(this.view, activeUnit)) {
        this.fillCell(reachable.coord.x, reachable.coord.y, reachable.coord.z, 0xffffff, 0.18);
      }
      return;
    }

    // Targeting preview: which cells this spell can legally be aimed at.
    // Range is Manhattan; blocked line of sight is shown rather than hidden,
    // so the ridge reads as cover instead of as an unexplained rejection.
    const spell = this.view.spellById(this.selectedSpellId);
    if (spell === null) {
      return;
    }
    const heightAt = (x: number, y: number): number => this.view.cellAt(x, y)?.z ?? 0;
    for (const cell of this.view.cells) {
      const distance =
        Math.abs(cell.x - activeUnit.position.x) + Math.abs(cell.y - activeUnit.position.y);
      if (distance < spell.minRange || distance > spell.maxRange) {
        continue;
      }
      const blocked =
        spell.requiresLineOfSight &&
        !hasLineOfSightOverHeights(heightAt, activeUnit.position, {
          x: cell.x,
          y: cell.y,
          z: cell.z,
        });
      this.fillCell(cell.x, cell.y, cell.z, blocked ? 0xff5e5e : 0xffb347, blocked ? 0.12 : 0.3);
    }
  }

  private fillCell(x: number, y: number, z: number, color: number, alpha: number): void {
    const centerX = isoX(x, y);
    const centerY = isoY(x, y, z);
    this.highlightGraphics.fillStyle(color, alpha);
    this.highlightGraphics.fillPoints(
      [
        { x: centerX, y: centerY - TILE_HEIGHT / 2 },
        { x: centerX + TILE_WIDTH / 2, y: centerY },
        { x: centerX, y: centerY + TILE_HEIGHT / 2 },
        { x: centerX - TILE_WIDTH / 2, y: centerY },
      ],
      true,
    );
  }

  private floatText(x: number, y: number, z: number, text: string, color: string): void {
    const label = this.add
      .text(isoX(x, y), isoY(x, y, z) - 34, text, { fontSize: "16px", color, fontStyle: "bold" })
      .setOrigin(0.5, 1);
    this.boardLayer.add(label);
    label.setDepth(depthOf(x, y, z) + 100);
    this.tweens.add({
      targets: label,
      y: label.y - 24,
      alpha: 0,
      duration: 700,
      onComplete: () => {
        label.destroy();
      },
    });
  }
}

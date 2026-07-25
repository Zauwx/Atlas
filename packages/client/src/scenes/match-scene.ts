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
import {
  canCastUnderRules,
  canClimbUnderRules,
  canMoveUnderRules,
  createV1RuleRegistry,
  hasLineOfSightOverHeights,
} from "@atlas/engine";
import { areaOf, areaOffsets } from "@atlas/shared";
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
  /** A pulsing ring marking whichever unit is currently acting. */
  private activeMarker!: Phaser.GameObjects.Ellipse;
  private readonly unitVisuals = new Map<UnitId, UnitVisual>();
  private hud!: Hud;

  /**
   * The same rule hooks the server runs, used only to preview what it
   * would decide (reachable cells, spell targets). Never authoritative.
   */
  private readonly ruleRegistry = createV1RuleRegistry();
  private readonly eventQueue: GameEvent[] = [];
  private animating = false;
  private selectedSpellId: SpellId | null = null;
  /** Cell under the cursor, used to preview an area spell's footprint. */
  private hoveredCell: { x: number; y: number } | null = null;
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
    this.activeMarker = this.add.ellipse(0, 0, TILE_WIDTH * 0.7, TILE_HEIGHT * 0.7, 0xffe066, 0.28);
    this.activeMarker.setStrokeStyle(2, 0xffe066, 0.9);
    this.activeMarker.setVisible(false);
    this.boardLayer.add(this.boardGraphics);
    this.boardLayer.add(this.highlightGraphics);
    this.boardLayer.add(this.activeMarker);
    // A slow pulse so the acting unit is easy to find at a glance.
    this.tweens.add({
      targets: this.activeMarker,
      scale: { from: 0.85, to: 1.1 },
      alpha: { from: 0.5, to: 0.85 },
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

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
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      const cell = pickCell(
        this.view.cells,
        pointer.x - this.boardLayer.x,
        pointer.y - this.boardLayer.y,
      );
      const next = cell === null ? null : { x: cell.x, y: cell.y };
      const changed =
        (next === null) !== (this.hoveredCell === null) ||
        (next !== null &&
          this.hoveredCell !== null &&
          (next.x !== this.hoveredCell.x || next.y !== this.hoveredCell.y));
      if (changed) {
        this.hoveredCell = next;
        if (this.selectedSpellId !== null) {
          this.refreshIdleUi();
        }
      }
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

    if (!this.canMove(myUnit)) {
      this.hud.showMessage("Rooted — cannot move.");
      return;
    }
    const path = suggestPath(this.view, myUnit, cell.x, cell.y, this.canClimb(myUnit));
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

  /** The stance/state IDs affecting a unit, for the rule-preview helpers. */
  private modifierIdsOf(unit: UnitView): string[] {
    return [
      ...(unit.revealedStanceId === null ? [] : [unit.revealedStanceId]),
      ...unit.states.map((instance) => instance.stateId),
    ];
  }

  /** Preview the same rules the server enforces (Frozen/Rooted/Electrified). */
  private canClimb(unit: UnitView): boolean {
    return canClimbUnderRules(this.ruleRegistry, this.modifierIdsOf(unit));
  }

  private canMove(unit: UnitView): boolean {
    return canMoveUnderRules(this.ruleRegistry, this.modifierIdsOf(unit));
  }

  private canCast(unit: UnitView): boolean {
    return canCastUnderRules(this.ruleRegistry, this.modifierIdsOf(unit));
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
      this.drawTile(
        graphics,
        cell.terrainId,
        isoX(cell.x, cell.y),
        isoY(cell.x, cell.y, cell.z),
        cell.z,
      );
    }
  }

  /**
   * One isometric tile: extruded terrace with lit/shadowed side faces, a
   * beveled top (lighter top-left edge, darker bottom-right), and a
   * per-terrain accent. Pure Graphics — no assets.
   */
  private drawTile(
    graphics: Phaser.GameObjects.Graphics,
    terrainId: string,
    centerX: number,
    centerY: number,
    z: number,
  ): void {
    const topColor = colorForTerrain(terrainId);
    const halfW = TILE_WIDTH / 2;
    const halfH = TILE_HEIGHT / 2;
    const sideHeight = z * Z_STEP;

    const top = { x: centerX, y: centerY - halfH };
    const right = { x: centerX + halfW, y: centerY };
    const bottom = { x: centerX, y: centerY + halfH };
    const left = { x: centerX - halfW, y: centerY };

    if (sideHeight > 0) {
      // Left face (lit) and right face (shadow), each split into an upper
      // and lower band so tall cliffs read as receding into shade.
      this.drawSideFace(
        graphics,
        left,
        bottom,
        sideHeight,
        shade(topColor, 0.62),
        shade(topColor, 0.5),
      );
      this.drawSideFace(
        graphics,
        right,
        bottom,
        sideHeight,
        shade(topColor, 0.46),
        shade(topColor, 0.36),
      );
    }

    // Top face.
    graphics.fillStyle(topColor);
    graphics.fillPoints([top, right, bottom, left], true);

    this.drawTerrainDetail(graphics, terrainId, centerX, centerY, halfW, halfH);

    // Bevel: lit rim on the two top-left edges, shadow rim bottom-right.
    graphics.lineStyle(1.5, shade(topColor, 1.35), 0.5);
    graphics.strokePoints([left, top, right], false);
    graphics.lineStyle(1.5, shade(topColor, 0.6), 0.5);
    graphics.strokePoints([right, bottom, left], false);
    // Thin seam so the grid stays legible.
    graphics.lineStyle(1, 0x0e1420, 0.25);
    graphics.strokePoints([top, right, bottom, left, top], false);
  }

  private drawSideFace(
    graphics: Phaser.GameObjects.Graphics,
    edge: { x: number; y: number },
    bottom: { x: number; y: number },
    sideHeight: number,
    upper: number,
    lower: number,
  ): void {
    const mid = sideHeight / 2;
    graphics.fillStyle(upper);
    graphics.fillPoints(
      [
        { x: edge.x, y: edge.y },
        { x: bottom.x, y: bottom.y },
        { x: bottom.x, y: bottom.y + mid },
        { x: edge.x, y: edge.y + mid },
      ],
      true,
    );
    graphics.fillStyle(lower);
    graphics.fillPoints(
      [
        { x: edge.x, y: edge.y + mid },
        { x: bottom.x, y: bottom.y + mid },
        { x: bottom.x, y: bottom.y + sideHeight },
        { x: edge.x, y: edge.y + sideHeight },
      ],
      true,
    );
  }

  /** Cheap per-terrain texture marks that sell the material. */
  private drawTerrainDetail(
    graphics: Phaser.GameObjects.Graphics,
    terrainId: string,
    cx: number,
    cy: number,
    halfW: number,
    halfH: number,
  ): void {
    const base = colorForTerrain(terrainId);
    switch (terrainId) {
      case "water": {
        graphics.lineStyle(2, shade(base, 1.4), 0.5);
        graphics.beginPath();
        graphics.moveTo(cx - halfW * 0.4, cy - halfH * 0.15);
        graphics.lineTo(cx, cy - halfH * 0.05);
        graphics.lineTo(cx + halfW * 0.4, cy - halfH * 0.15);
        graphics.strokePath();
        graphics.lineStyle(2, shade(base, 1.25), 0.4);
        graphics.beginPath();
        graphics.moveTo(cx - halfW * 0.35, cy + halfH * 0.3);
        graphics.lineTo(cx, cy + halfH * 0.4);
        graphics.lineTo(cx + halfW * 0.35, cy + halfH * 0.3);
        graphics.strokePath();
        return;
      }
      case "lava": {
        graphics.fillStyle(shade(base, 1.45), 0.9);
        graphics.fillCircle(cx - halfW * 0.2, cy, 3);
        graphics.fillCircle(cx + halfW * 0.25, cy + halfH * 0.2, 2.5);
        graphics.lineStyle(1.5, shade(base, 0.5), 0.7);
        graphics.beginPath();
        graphics.moveTo(cx - halfW * 0.4, cy - halfH * 0.2);
        graphics.lineTo(cx + halfW * 0.1, cy + halfH * 0.2);
        graphics.strokePath();
        return;
      }
      case "ice": {
        graphics.fillStyle(0xffffff, 0.35);
        graphics.fillPoints(
          [
            { x: cx, y: cy - halfH },
            { x: cx + halfW * 0.5, y: cy - halfH * 0.5 },
            { x: cx - halfW * 0.5, y: cy - halfH * 0.5 },
          ],
          true,
        );
        return;
      }
      case "vegetation": {
        graphics.fillStyle(shade(base, 1.35), 0.7);
        for (const [ox, oy] of [
          [-0.3, -0.1],
          [0.15, -0.2],
          [0.25, 0.2],
          [-0.15, 0.25],
        ] as const) {
          graphics.fillCircle(cx + halfW * ox, cy + halfH * oy, 2);
        }
        return;
      }
      case "earth": {
        graphics.fillStyle(shade(base, 0.7), 0.7);
        graphics.fillCircle(cx - halfW * 0.2, cy - halfH * 0.1, 2);
        graphics.fillCircle(cx + halfW * 0.25, cy + halfH * 0.15, 2.5);
        graphics.fillStyle(shade(base, 1.2), 0.6);
        graphics.fillCircle(cx + halfW * 0.05, cy - halfH * 0.2, 1.5);
        return;
      }
      case "void": {
        // An inner well to read as a bottomless pit.
        graphics.fillStyle(0x000000, 0.6);
        graphics.fillPoints(
          [
            { x: cx, y: cy - halfH * 0.55 },
            { x: cx + halfW * 0.55, y: cy },
            { x: cx, y: cy + halfH * 0.55 },
            { x: cx - halfW * 0.55, y: cy },
          ],
          true,
        );
        return;
      }
      default:
        return;
    }
  }

  private createUnitVisual(unit: UnitView): void {
    // Blue = me, red = opponent, regardless of join order.
    const ownerIndex = unit.playerId === this.myPlayerId ? 0 : 1;
    const color = colorForPlayer(ownerIndex);

    const token = this.add.graphics();
    // Ground shadow, then a beveled token: dark base, colored body, a rim
    // outline, and a top-left highlight for a lit, rounded look.
    token.fillStyle(0x000000, 0.28);
    token.fillEllipse(0, 3, 24, 11);
    token.fillStyle(shade(color, 0.55));
    token.fillCircle(0, -10, 13);
    token.fillStyle(color);
    token.fillCircle(0, -11, 12);
    token.fillStyle(shade(color, 1.45), 0.85);
    token.fillCircle(-4, -15, 4);
    token.lineStyle(2, 0x0e1420, 0.9);
    token.strokeCircle(0, -11, 12);

    const healthBar = this.add.graphics();
    const container = this.add.container(
      isoX(unit.position.x, unit.position.y),
      isoY(unit.position.x, unit.position.y, unit.position.z),
      [token, healthBar],
    );
    this.boardLayer.add(container);
    container.setDepth(depthOf(unit.position.x, unit.position.y, unit.position.z) + 8);
    this.unitVisuals.set(unit.id, { container, healthBar });
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
    graphics.fillStyle(0x0e1420, 0.85);
    graphics.fillRoundedRect(-16, -36, 32, 6, 2);
    graphics.fillStyle(ratio > 0.5 ? 0x66e08a : ratio > 0.25 ? 0xffcf6b : 0xff6a6a);
    graphics.fillRoundedRect(-15, -35, Math.max(0, 30 * ratio), 4, 2);
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
    const activeUnit = this.myActiveUnit();
    // An Electrified unit cannot cast, so drop any selection and hide the bar.
    if (activeUnit !== null && this.selectedSpellId !== null && !this.canCast(activeUnit)) {
      this.selectedSpellId = null;
    }
    this.hud.update(
      this.view,
      this.myPlayerId,
      myUnit ?? null,
      this.selectedSpellId,
      this.stanceLocked,
      activeUnit === null ? true : this.canCast(activeUnit),
    );

    // Mark whichever unit is acting, for either player, so turn order reads.
    const acting =
      this.view.activeUnitId === null ? null : this.view.unitById(this.view.activeUnitId);
    if (acting !== null && acting.alive && !this.matchOver) {
      this.activeMarker.setVisible(true);
      this.activeMarker.setPosition(
        isoX(acting.position.x, acting.position.y),
        isoY(acting.position.x, acting.position.y, acting.position.z) + 2,
      );
    } else {
      this.activeMarker.setVisible(false);
    }

    this.highlightGraphics.clear();
    if (activeUnit === null || this.matchOver) {
      return;
    }

    if (this.selectedSpellId === null) {
      // Rooted units have no reachable cells to show.
      if (!this.canMove(activeUnit)) {
        return;
      }
      for (const reachable of reachableCells(this.view, activeUnit, this.canClimb(activeUnit))) {
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
    // Sight height: terrain height, plus one where the terrain is opaque
    // (rulebook: Line of Sight) — vegetation conceals at ground level.
    const opaqueTerrains = new Set(
      this.view.config.terrains.filter((terrain) => terrain.opaque).map((terrain) => terrain.id),
    );
    const heightAt = (x: number, y: number): number => {
      const cell = this.view.cellAt(x, y);
      if (cell === null) {
        return 0;
      }
      return cell.z + (opaqueTerrains.has(cell.terrainId) ? 1 : 0);
    };
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

    // The blast footprint under the cursor, so an area spell shows exactly
    // what it will cover before it is committed.
    const area = areaOf(spell);
    if (area.kind === "Single" || this.hoveredCell === null) {
      return;
    }
    const aim = this.hoveredCell;
    const inRange =
      Math.abs(aim.x - activeUnit.position.x) + Math.abs(aim.y - activeUnit.position.y);
    if (inRange < spell.minRange || inRange > spell.maxRange) {
      return;
    }
    for (const offset of areaOffsets(area)) {
      const cell = this.view.cellAt(aim.x + offset.dx, aim.y + offset.dy);
      if (cell !== null) {
        this.fillCell(cell.x, cell.y, cell.z, 0xffffff, 0.32);
      }
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

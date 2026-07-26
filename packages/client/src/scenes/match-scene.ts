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
import {
  CUBE_SCALE_X,
  CUBE_SCALE_Y,
  depthOf,
  isoX,
  isoY,
  pickCell,
  TILE_HEIGHT,
  TILE_WIDTH,
  Z_STEP,
} from "../render/iso.js";
import { colorForPlayer, colorForTerrain, shade } from "../render/palette.js";
import { Hud, iconKey } from "../ui/hud.js";

/**
 * Terrains rendered as a Kenney cube sprite (CC0, see public/tiles). Any
 * terrain not listed here — currently just Void — falls back to the
 * procedural tile, so the board still renders if a texture is missing.
 */
const TERRAIN_TEXTURE: Readonly<Record<string, string>> = {
  normal: "tile-normal",
  water: "tile-water",
  ice: "tile-ice",
  vegetation: "tile-vegetation",
  earth: "tile-earth",
  lava: "tile-lava",
};

/**
 * Where a cube sprite's top-face center sits within its frame, as a
 * fraction of height — so placing the image at isoY lands the walkable
 * surface under the unit. Measured from the pack's cubes: the top-diamond
 * center is 32px down a 128px frame.
 */
const CUBE_TOP_ORIGIN_Y = 0.25;

/**
 * Depth so movement/targeting highlights always read on top of the tiles.
 * Tile and unit depths come from depthOf (max ~360 on a 12×12), so this
 * sits well above them.
 */
const HIGHLIGHT_DEPTH = 900;
/** A unit sits just above its own tile top so front tiles still occlude it. */
const UNIT_DEPTH_BIAS = 0.5;
/** The active-unit ring sits just under its unit. */
const MARKER_DEPTH_BIAS = 0.4;

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
  /** Row of active-state badges, rebuilt whenever the unit's states change. */
  states: Phaser.GameObjects.Container;
}

const MOVE_MS_PER_CELL = 140;

/** Spell effects draw above tiles, units, and highlights. */
const FX_DEPTH = 1200;

/** Effect tint by damage element — a spell reads by its color. */
const ELEMENT_COLORS: Readonly<Record<string, number>> = {
  Physical: 0xf2f2f2,
  Fire: 0xff7b3d,
  Water: 0x4ea8ff,
  Ice: 0x9fe6ff,
  Lightning: 0xffe14e,
  Earth: 0xc79a5b,
  Air: 0xcfeaff,
  Neutral: 0xd7d7d7,
};

/** Effect tint by state, for the flash when one is applied. */
const STATE_COLORS: Readonly<Record<string, number>> = {
  wet: 0x4ea8ff,
  burning: 0xff7b3d,
  frozen: 0x9fe6ff,
  rooted: 0xb98a4a,
  electrified: 0xffe14e,
  shielded: 0xbcd4ff,
};

/**
 * The absorbing state gets extra emphasis (an outline hugging the health
 * bar), since it protects the very points shown there.
 */
const SHIELD_STATE_ID = "shielded";

/** Friendlier text for the rejection codes a player runs into most. */
const REJECTION_MESSAGES: Readonly<Partial<Record<string, string>>> = {
  NoTargetInArea: "No target there — no AP spent.",
  OutOfRange: "Out of range.",
  NoLineOfSight: "No line of sight.",
  NotEnoughActionPoints: "Not enough AP.",
  NotEnoughMovementPoints: "Not enough MP.",
  CastBlocked: "Electrified — cannot cast.",
  MovementBlocked: "Rooted — cannot move.",
};

export class MatchScene extends Phaser.Scene implements SessionSink {
  private connection!: MatchConnection;
  private session!: MatchSession;
  private view!: MatchView;
  private myPlayerId!: PlayerId;

  private boardLayer!: Phaser.GameObjects.Container;
  private highlightGraphics!: Phaser.GameObjects.Graphics;
  /** A pulsing ring marking whichever unit is currently acting. */
  private activeMarker!: Phaser.GameObjects.Ellipse;
  /** Per-cell tile objects (cube sprites or procedural graphics), rebuilt on redraw. */
  private tileObjects: Phaser.GameObjects.GameObject[] = [];
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

  preload(): void {
    // Kenney CC0 terrain cubes served from public/tiles.
    for (const key of Object.values(TERRAIN_TEXTURE)) {
      this.load.image(key, `tiles/${key}.png`);
    }
    // Generated skill icons: a manifest lists which exist, so the HUD hot-swaps
    // them in when present and falls back to glyphs otherwise (vector SVGs from
    // packages/client/tools/generate-spell-icons-svg.mjs, rasterised on load at
    // a crisp size). Missing files are ignored so the board still loads.
    this.load.json("icon-manifest", "icons/manifest.json");
    this.load.on(
      "filecomplete-json-icon-manifest",
      (_key: string, _type: string, data: unknown) => {
        if (!Array.isArray(data)) {
          return;
        }
        for (const id of data) {
          if (typeof id === "string") {
            this.load.svg(iconKey(id), `icons/${id}.svg`, { width: 96, height: 96 });
          }
        }
      },
    );
    this.load.on("loaderror", () => {
      // A missing icon or manifest is fine — glyphs cover it.
    });
  }

  create(): void {
    this.boardLayer = this.add.container(0, 0);
    this.fitBoard();
    // Tiles are added directly to the board layer with per-cube depth, so
    // units (also depth-sorted) occlude and are occluded correctly.
    this.highlightGraphics = this.add.graphics();
    this.highlightGraphics.setDepth(HIGHLIGHT_DEPTH);
    this.activeMarker = this.add.ellipse(0, 0, TILE_WIDTH * 0.7, TILE_HEIGHT * 0.7, 0xffe066, 0.28);
    this.activeMarker.setStrokeStyle(2, 0xffe066, 0.9);
    this.activeMarker.setVisible(false);
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
      const local = this.boardLocal(pointer);
      const cell = pickCell(this.view.cells, local.x, local.y);
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

  /**
   * A Phaser Container renders its children in insertion order and ignores
   * their `depth`, so newly added objects paint over older ones regardless
   * of height. drawBoard() rebuilds every tile on a terrain change and
   * appends them after the units, which would otherwise bury the units (and
   * the highlight/marker layers) behind the ground. Re-sorting by depth each
   * frame makes the depths assigned across this scene actually drive
   * occlusion: tiles and units interleave by height, with highlights and
   * effects on top. The board is ~150 objects, so the stable sort is cheap.
   */
  override update(): void {
    this.boardLayer.sort("depth");
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
    this.hud.showMessage(REJECTION_MESSAGES[rejection.code] ?? `Rejected: ${rejection.code}`);
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
    this.logEvent(event);
    this.animateEvent(event, () => {
      this.animating = false;
      this.processNextEvent();
    });
  }

  /** "You"/"Enemy" for a unit, so the combat log reads at a glance. */
  private side(unitId: UnitId): string {
    const unit = this.view.unitById(unitId);
    return unit !== null && unit.playerId === this.myPlayerId ? "You" : "Enemy";
  }

  /** Turns the notable events into one-line combat-log entries. */
  private logEvent(event: GameEvent): void {
    switch (event.type) {
      case "Damage":
        this.hud.pushLog(
          `${this.side(event.targetUnitId)} takes ${String(event.amount)} ${event.element}`,
        );
        return;
      case "Heal":
        this.hud.pushLog(`${this.side(event.targetUnitId)} heals ${String(event.amount)}`);
        return;
      case "Collision":
        this.hud.pushLog(`${this.side(event.unitId)} takes ${String(event.damage)} on impact`);
        return;
      case "Fall":
        if (event.damage > 0) {
          this.hud.pushLog(`${this.side(event.unitId)} falls — ${String(event.damage)}`);
        }
        return;
      case "ApplyState": {
        if (event.target.kind === "Unit") {
          const name =
            this.view.config.states.find((state) => state.id === event.stateId)?.name ??
            event.stateId;
          this.hud.pushLog(`${this.side(event.target.unitId)}: ${name}`);
        }
        return;
      }
      case "Death":
        this.hud.pushLog(`${this.side(event.unitId)} is defeated`);
        return;
      case "TerrainChanged": {
        const terrain = event.toTerrainId;
        this.hud.pushLog(`A tile becomes ${terrain.charAt(0).toUpperCase()}${terrain.slice(1)}`);
        return;
      }
      default:
        return;
    }
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
        const origin = this.surfaceXY(event.from.x, event.from.y, event.from.z);
        this.burst(origin.x, origin.y, 0xd7d7d7, 1.7);
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
        const at = this.surfaceXY(event.at.x, event.at.y, event.at.z);
        this.burst(at.x, at.y, 0xffb066, 2);
        this.floatText(event.at.x, event.at.y, event.at.z, `-${String(event.damage)}`, "#ff8a5e");
        this.syncUnitVisual(event.unitId);
        this.time.delayedCall(250, done);
        return;
      }
      case "Damage": {
        const unit = this.view.unitById(event.targetUnitId);
        const color = ELEMENT_COLORS[event.element] ?? 0xffffff;
        const target =
          unit === null ? null : this.surfaceXY(unit.position.x, unit.position.y, unit.position.z);
        const landHit = (): void => {
          if (target !== null) {
            this.burst(target.x, target.y, color);
          }
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
        };
        // A spell hit carries its caster; fly a bolt from caster to target.
        // Sourceless damage (a Burning tick) just flashes on impact.
        const source = event.sourceUnitId === null ? null : this.view.unitById(event.sourceUnitId);
        if (source !== null && target !== null && source.id !== event.targetUnitId) {
          const from = this.surfaceXY(source.position.x, source.position.y, source.position.z);
          this.burst(from.x, from.y, color, 1.8);
          this.spawnProjectile(from, target, color, () => {
            landHit();
            this.time.delayedCall(150, done);
          });
          return;
        }
        landHit();
        this.time.delayedCall(220, done);
        return;
      }
      case "Heal": {
        const unit = this.view.unitById(event.targetUnitId);
        if (unit !== null) {
          const at = this.surfaceXY(unit.position.x, unit.position.y, unit.position.z);
          this.burst(at.x, at.y, 0x7dff9a, 2.2);
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
        const at = this.surfaceXY(event.at.x, event.at.y, event.at.z);
        this.burst(at.x, at.y, colorForTerrain(event.toTerrainId), 2.6);
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
      case "ApplyState": {
        const color = STATE_COLORS[event.stateId] ?? 0xffffff;
        let at: { x: number; y: number } | null = null;
        if (event.target.kind === "Unit") {
          const unit = this.view.unitById(event.target.unitId);
          if (unit !== null) {
            at = this.surfaceXY(unit.position.x, unit.position.y, unit.position.z);
          }
          // Persist the badge now that the state is on the unit.
          this.syncUnitVisual(event.target.unitId);
        } else {
          at = this.surfaceXY(event.target.coord.x, event.target.coord.y, event.target.coord.z);
        }
        if (at !== null) {
          this.burst(at.x, at.y, color, 2.2);
        }
        this.time.delayedCall(140, done);
        return;
      }
      case "RemoveState": {
        // Clear the badge (and any shield outline) the moment it wears off.
        if (event.target.kind === "Unit") {
          this.syncUnitVisual(event.target.unitId);
        }
        this.time.delayedCall(60, done);
        return;
      }
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
    const local = this.boardLocal(pointer);
    const cell = pickCell(this.view.cells, local.x, local.y);
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

  /** Pointer position in board-local space, undoing the board's fit scale. */
  private boardLocal(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const scale = this.boardLayer.scaleX || 1;
    return {
      x: (pointer.x - this.boardLayer.x) / scale,
      y: (pointer.y - this.boardLayer.y) / scale,
    };
  }

  /**
   * Scales and centres the board so any map size — including tall terraces —
   * fits in the band between the enemy panel and the HUD bar, never
   * overflowing the viewport or hiding behind the UI.
   */
  private fitBoard(): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const cell of this.view.cells) {
      const centerX = isoX(cell.x, cell.y);
      minX = Math.min(minX, centerX - TILE_WIDTH / 2);
      maxX = Math.max(maxX, centerX + TILE_WIDTH / 2);
      // Top of the raised diamond up top; bottom of the ground-level cube skirt.
      minY = Math.min(minY, isoY(cell.x, cell.y, cell.z) - TILE_HEIGHT / 2);
      maxY = Math.max(maxY, isoY(cell.x, cell.y, 0) + TILE_HEIGHT / 2 + Z_STEP);
    }
    const topMargin = 78;
    const bottomMargin = 84;
    const sideMargin = 20;
    const availableWidth = this.scale.width - sideMargin * 2;
    const availableHeight = this.scale.height - topMargin - bottomMargin;
    const scale = Math.min(1, availableWidth / (maxX - minX), availableHeight / (maxY - minY));
    this.boardLayer.setScale(scale);
    this.boardLayer.setPosition(
      this.scale.width / 2 - ((minX + maxX) / 2) * scale,
      topMargin + availableHeight / 2 - ((minY + maxY) / 2) * scale,
    );
  }

  /**
   * Rebuilds the board. Mapped terrains render as stacked Kenney cube
   * sprites (a column from the ground up to the cell's height, so the
   * sides form a cliff); Void and any unmapped terrain fall back to a
   * procedural diamond. Each object carries its own depthOf so units
   * interleave correctly with elevated terrain.
   */
  private drawBoard(): void {
    for (const object of this.tileObjects) {
      object.destroy();
    }
    this.tileObjects = [];

    for (const cell of this.view.cells) {
      const textureKey = TERRAIN_TEXTURE[cell.terrainId];
      const centerX = isoX(cell.x, cell.y);

      if (textureKey !== undefined && this.textures.exists(textureKey)) {
        for (let level = 0; level <= cell.z; level += 1) {
          const cube = this.add.image(centerX, isoY(cell.x, cell.y, level), textureKey);
          cube.setScale(CUBE_SCALE_X, CUBE_SCALE_Y);
          cube.setOrigin(0.5, CUBE_TOP_ORIGIN_Y);
          cube.setDepth(depthOf(cell.x, cell.y, level));
          this.boardLayer.add(cube);
          this.tileObjects.push(cube);
        }
      } else {
        const graphics = this.add.graphics();
        this.drawTile(graphics, cell.terrainId, centerX, isoY(cell.x, cell.y, cell.z), cell.z);
        graphics.setDepth(depthOf(cell.x, cell.y, cell.z));
        this.boardLayer.add(graphics);
        this.tileObjects.push(graphics);
      }
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
    const states = this.add.container(0, 0);
    const container = this.add.container(
      isoX(unit.position.x, unit.position.y),
      isoY(unit.position.x, unit.position.y, unit.position.z),
      [token, healthBar, states],
    );
    this.boardLayer.add(container);
    container.setDepth(
      depthOf(unit.position.x, unit.position.y, unit.position.z) + UNIT_DEPTH_BIAS,
    );
    this.unitVisuals.set(unit.id, { container, healthBar, states });
    this.redrawHealthBar(unit);
    this.redrawStates(unit);
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
    // A shielded unit's health is guarded: outline the bar so it reads at a
    // glance that these points are protected.
    if (unit.states.some((state) => state.stateId === SHIELD_STATE_ID)) {
      graphics.lineStyle(1.5, STATE_COLORS[SHIELD_STATE_ID] ?? 0xbcd4ff, 0.95);
      graphics.strokeRoundedRect(-18, -38, 36, 10, 3);
    }
  }

  /**
   * A row of small colored badges above the health bar — one per active
   * state, lettered by its name — so a unit's status is always visible, not
   * only in the flash when it lands.
   */
  private redrawStates(unit: UnitView): void {
    const visual = this.unitVisuals.get(unit.id);
    if (visual === undefined) {
      return;
    }
    visual.states.removeAll(true);
    const badgeWidth = 12;
    const gap = 2;
    const count = unit.states.length;
    const totalWidth = count * badgeWidth + (count - 1) * gap;
    let x = -totalWidth / 2 + badgeWidth / 2;
    const y = -46;
    for (const state of unit.states) {
      const color = STATE_COLORS[state.stateId] ?? 0xffffff;
      const badge = this.add.graphics();
      badge.fillStyle(color, 0.95);
      badge.fillRoundedRect(x - badgeWidth / 2, y - 6, badgeWidth, 12, 3);
      badge.lineStyle(1, 0x0e1420, 0.9);
      badge.strokeRoundedRect(x - badgeWidth / 2, y - 6, badgeWidth, 12, 3);
      const name = this.view.config.states.find((entry) => entry.id === state.stateId)?.name ?? "?";
      const letter = this.add
        .text(x, y, name.charAt(0).toUpperCase(), {
          fontSize: "10px",
          color: "#0e1420",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      visual.states.add([badge, letter]);
      x += badgeWidth + gap;
    }
  }

  private syncUnitVisual(unitId: UnitId): void {
    const unit = this.view.unitById(unitId);
    if (unit !== null) {
      this.redrawHealthBar(unit);
      this.redrawStates(unit);
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
      visual.container.setDepth(depthOf(target.x, target.y, target.z) + UNIT_DEPTH_BIAS);
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
      this.activeMarker.setDepth(
        depthOf(acting.position.x, acting.position.y, acting.position.z) + MARKER_DEPTH_BIAS,
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

  // --- Spell effects (procedural, no assets) ---

  /** Screen position of a cell's surface, in board-layer space. */
  private surfaceXY(x: number, y: number, z: number): { x: number; y: number } {
    return { x: isoX(x, y), y: isoY(x, y, z) - 8 };
  }

  /** A bolt that flies from caster to target, then calls onHit at the impact. */
  private spawnProjectile(
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
    onHit: () => void,
  ): void {
    const bolt = this.add.circle(from.x, from.y, 5, color);
    bolt.setStrokeStyle(2, 0xffffff, 0.7);
    bolt.setDepth(FX_DEPTH);
    this.boardLayer.add(bolt);
    const distance = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
    this.tweens.add({
      targets: bolt,
      x: to.x,
      y: to.y,
      duration: Phaser.Math.Clamp(distance * 1.6, 120, 320),
      ease: "Quad.easeIn",
      onComplete: () => {
        bolt.destroy();
        onHit();
      },
    });
  }

  /** An expanding ring that fades — used for impacts, casts, and splashes. */
  private burst(x: number, y: number, color: number, maxScale = 3): void {
    const ring = this.add.circle(x, y, 7, color, 0.5);
    ring.setStrokeStyle(2, color, 0.9);
    ring.setDepth(FX_DEPTH);
    this.boardLayer.add(ring);
    this.tweens.add({
      targets: ring,
      scale: maxScale,
      alpha: 0,
      duration: 300,
      ease: "Quad.easeOut",
      onComplete: () => {
        ring.destroy();
      },
    });
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

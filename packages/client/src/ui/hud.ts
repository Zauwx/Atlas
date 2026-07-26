import Phaser from "phaser";
import type { GameConfig, PlayerId, SpellConfig, SpellId, StanceId } from "@atlas/shared";
import type { MatchView, UnitView } from "../state/match-view.js";
import { describeRevealedStances, describeSpell } from "./describe.js";

/**
 * In-canvas HUD, laid out as a single bottom bar plus a compact enemy panel
 * — clear and precise (a Dofus-style read): a framed hero panel with an HP
 * bar and bold color-coded AP/MP gauges, a skill bar of element-tinted spell
 * slots with cost badges and live affordable/selected/blocked states, and a
 * turn zone with a countdown and End turn.
 *
 * GAME_DESIGN.md "Design Principles": important information must be visible.
 * Every stance and spell states what it does, read from configuration.
 */

export interface HudCallbacks {
  onEndTurn(): void;
  onSpellToggled(spellId: SpellId): void;
  onStanceChosen(stanceId: StanceId): void;
}

const AP_COLOR = 0x3f8ae0;
const MP_COLOR = 0x6fae2e;
const PANEL_BG = 0x141c2b;
const PANEL_BORDER = 0x2b3a55;
const SLOT_SIZE = 56;
const SLOT_GAP = 8;
/** Circular turn-timer geometry (top-center). */
const CLOCK_CY = 52;
const CLOCK_R = 22;

/** Slot tint by a spell's element, so the bar reads by color at a glance. */
const ELEMENT_TINT: Readonly<Record<string, number>> = {
  Physical: 0x8a94a6,
  Fire: 0xff7b3d,
  Water: 0x4ea8ff,
  Ice: 0x9fe6ff,
  Lightning: 0xffe14e,
  Earth: 0xc79a5b,
  Air: 0xcfeaff,
  Neutral: 0xbcd4ff,
};

/** Texture key a generated icon is loaded under (see tools/generate-spell-icons). */
export const iconKey = (spellId: string): string => `icon-${spellId}`;

interface SkillSlot {
  readonly spell: SpellConfig;
  readonly frame: Phaser.GameObjects.Graphics;
  readonly glyph: Phaser.GameObjects.Text | Phaser.GameObjects.Image;
  readonly cost: Phaser.GameObjects.Text;
  readonly x: number;
  readonly y: number;
}

export class Hud {
  private statusText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private endTurnButton!: Phaser.GameObjects.Text;

  private roundText!: Phaser.GameObjects.Text;
  private clockRing!: Phaser.GameObjects.Graphics;
  private clockSeconds!: Phaser.GameObjects.Text;

  private heroName!: Phaser.GameObjects.Text;
  private heroPortrait!: Phaser.GameObjects.Text;
  private heroBars!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private apText!: Phaser.GameObjects.Text;
  private mpText!: Phaser.GameObjects.Text;

  private enemyPanel!: Phaser.GameObjects.Graphics;
  private enemyName!: Phaser.GameObjects.Text;
  private enemyBar!: Phaser.GameObjects.Graphics;
  private enemyHpText!: Phaser.GameObjects.Text;

  private logText!: Phaser.GameObjects.Text;
  private readonly logLines: string[] = [];

  private readonly slots: SkillSlot[] = [];
  private readonly stancePanel: Phaser.GameObjects.GameObject[] = [];
  private messageTimer: Phaser.Time.TimerEvent | null = null;
  private hoveredSpellId: SpellId | null = null;

  // Client-side turn clock: the server owns the real timer, but the config
  // duration lets the HUD show an approximate countdown from each turn start.
  private turnStartMs = 0;
  private turnSeconds = 0;
  private turnPrefix = "";
  private lastTurnKey = "";

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: GameConfig,
    private readonly callbacks: HudCallbacks,
  ) {}

  build(ownClassSpellIds: readonly SpellId[]): void {
    const { width, height } = this.scene.scale;

    this.statusText = this.text(12, 10, "", 13, "#9fb0cc").setDepth(1000);

    this.messageText = this.text(width / 2, height - 132, "", 15, "#ffd27a")
      .setOrigin(0.5, 0.5)
      .setDepth(1000);

    this.detailText = this.text(width / 2, height - 92, "", 12, "#a9b7d0")
      .setOrigin(0.5, 1)
      .setDepth(1000);

    this.buildHeroPanel();
    this.buildEnemyPanel();
    this.buildCenterClock();
    this.buildCombatLog();
    this.buildTurnZone();
    this.buildSkillBar(ownClassSpellIds);
    this.buildStancePanel();

    this.scene.time.addEvent({ delay: 250, loop: true, callback: () => this.tickTimer() });
  }

  private buildHeroPanel(): void {
    const { height } = this.scene.scale;
    const x = 12;
    const y = height - 12 - 96;
    this.panel(x, y, 236, 96);
    this.heroPortrait = this.text(x + 16, y + 16, "", 16, "#dce8ff")
      .setOrigin(0, 0)
      .setDepth(1001);
    this.heroName = this.text(x + 54, y + 14, "", 14, "#e8eefc")
      .setOrigin(0, 0)
      .setDepth(1001);
    this.text(x + 54, y + 33, "you", 11, "#6f7f9c")
      .setOrigin(0, 0)
      .setDepth(1001);
    this.heroBars = this.scene.add.graphics().setScrollFactor(0).setDepth(1001);
    this.hpText = this.text(x + 138, y + 52, "", 11, "#eafff2")
      .setOrigin(0.5, 0.5)
      .setDepth(1002);
    this.apText = this.text(x + 94, y + 78, "", 13, "#eaf2ff")
      .setOrigin(0.5, 0.5)
      .setDepth(1002);
    this.mpText = this.text(x + 182, y + 78, "", 13, "#eefbe2")
      .setOrigin(0.5, 0.5)
      .setDepth(1002);
  }

  private buildEnemyPanel(): void {
    const { width } = this.scene.scale;
    const w = 214;
    const x = width - 12 - w;
    const y = 12;
    this.enemyPanel = this.panel(x, y, w, 58);
    this.enemyName = this.text(x + 14, y + 10, "", 13, "#f2c0c0")
      .setOrigin(0, 0)
      .setDepth(1001);
    this.enemyBar = this.scene.add.graphics().setScrollFactor(0).setDepth(1001);
    this.enemyHpText = this.text(x + w / 2, y + 39, "", 11, "#ffecec")
      .setOrigin(0.5, 0.5)
      .setDepth(1002);
  }

  /** Top-center round indicator and circular turn timer (flashes under 5s). */
  private buildCenterClock(): void {
    const cx = this.scene.scale.width / 2;
    this.roundText = this.text(cx, 12, "", 12, "#9fb0cc").setOrigin(0.5, 0).setDepth(1001);
    this.clockRing = this.scene.add.graphics().setScrollFactor(0).setDepth(1001);
    this.clockSeconds = this.text(cx, CLOCK_CY, "", 17, "#e8eefc")
      .setOrigin(0.5, 0.5)
      .setDepth(1002);
  }

  /** Bottom-right combat log — a rolling history of the last few actions. */
  private buildCombatLog(): void {
    const { width, height } = this.scene.scale;
    const w = 250;
    const h = 116;
    const x = width - 12 - w;
    const y = height - 80 - h;
    this.panel(x, y, w, h);
    this.text(x + 12, y + 8, "COMBAT LOG", 10, "#5f6f8c")
      .setOrigin(0, 0)
      .setDepth(1001);
    this.logText = this.text(x + 12, y + 26, "", 11, "#9fb0cc")
      .setOrigin(0, 0)
      .setDepth(1001);
    this.logText.setWordWrapWidth(w - 24);
    this.logText.setLineSpacing(3);
  }

  /** Appends one line to the combat log, keeping only the most recent few. */
  pushLog(line: string): void {
    this.logLines.push(line);
    while (this.logLines.length > 5) {
      this.logLines.shift();
    }
    this.logText.setText(this.logLines.join("\n"));
  }

  private buildTurnZone(): void {
    const { width, height } = this.scene.scale;
    this.turnText = this.text(width - 12, height - 60, "", 12, "#ffd27a")
      .setOrigin(1, 1)
      .setDepth(1001);
    this.endTurnButton = this.text(width - 12, height - 14, "End turn", {
      fontSize: "15px",
      color: "#eaf2ff",
      backgroundColor: "#2f6df0",
      padding: { x: 16, y: 9 },
    })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(1001)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.callbacks.onEndTurn();
      });
  }

  private buildSkillBar(ownClassSpellIds: readonly SpellId[]): void {
    const { width, height } = this.scene.scale;
    const spells = ownClassSpellIds
      .map((id) => this.config.spells.find((spell) => spell.id === id))
      .filter((spell): spell is SpellConfig => spell !== undefined);
    const totalWidth = spells.length * SLOT_SIZE + (spells.length - 1) * SLOT_GAP;
    let x = width / 2 - totalWidth / 2;
    const y = height - 12 - SLOT_SIZE;

    for (const spell of spells) {
      const frame = this.scene.add.graphics().setScrollFactor(0).setDepth(1001);
      const key = iconKey(spell.id);
      const glyph = this.scene.textures.exists(key)
        ? this.scene.add
            .image(x + SLOT_SIZE / 2, y + SLOT_SIZE / 2, key)
            .setDisplaySize(SLOT_SIZE - 8, SLOT_SIZE - 8)
            .setScrollFactor(0)
            .setDepth(1002)
        : this.text(x + SLOT_SIZE / 2, y + SLOT_SIZE / 2, this.glyphLabel(spell), 20, "#0e1420")
            .setOrigin(0.5, 0.5)
            .setDepth(1002);
      const cost = this.text(
        x + SLOT_SIZE - 4,
        y + SLOT_SIZE - 3,
        String(spell.actionPointCost),
        11,
        "#eaf2ff",
      )
        .setOrigin(1, 1)
        .setDepth(1003);

      const slot: SkillSlot = { spell, frame, glyph, cost, x, y };
      frame
        .setInteractive(
          new Phaser.Geom.Rectangle(x, y, SLOT_SIZE, SLOT_SIZE),
          (hit: Phaser.Geom.Rectangle, px: number, py: number) =>
            Phaser.Geom.Rectangle.Contains(hit, px, py),
        )
        .on("pointerdown", () => {
          this.callbacks.onSpellToggled(spell.id);
        })
        .on("pointerover", () => {
          this.hoveredSpellId = spell.id;
        })
        .on("pointerout", () => {
          if (this.hoveredSpellId === spell.id) {
            this.hoveredSpellId = null;
          }
        });
      this.slots.push(slot);
      x += SLOT_SIZE + SLOT_GAP;
    }
  }

  update(
    view: MatchView,
    myPlayerId: PlayerId,
    myUnit: UnitView | null,
    selectedSpellId: SpellId | null,
    stanceLocked: boolean,
    canCast: boolean,
  ): void {
    const isMyTurn =
      view.phase === "UnitTurns" && myUnit !== null && view.activeUnitId === myUnit.id;

    this.updateStatus(view, myPlayerId, stanceLocked);
    this.updateHeroPanel(myUnit);
    this.updateEnemyPanel(view, myPlayerId);
    this.updateSkillBar(myUnit, selectedSpellId, isMyTurn, canCast);
    this.updateDetail(isMyTurn, canCast, selectedSpellId);
    this.updateTurnClock(view, isMyTurn, stanceLocked);

    this.endTurnButton.setVisible(isMyTurn);
    this.setStanceVisible(view.phase === "StanceSelection" && !stanceLocked);
  }

  private updateStatus(view: MatchView, myPlayerId: PlayerId, stanceLocked: boolean): void {
    const stances = describeRevealedStances(view.units, myPlayerId, this.config);
    const phaseLine =
      view.phase === "StanceSelection" && !stanceLocked ? "Choose your stance." : "";
    this.statusText.setText([stances, phaseLine].filter((line) => line.length > 0).join("\n"));
    this.roundText.setText(view.roundNumber > 0 ? `ROUND ${String(view.roundNumber)}` : "");
  }

  private updateHeroPanel(unit: UnitView | null): void {
    this.heroBars.clear();
    if (unit === null) {
      this.heroName.setText("—");
      this.heroPortrait.setText("");
      this.hpText.setText("");
      this.apText.setText("");
      this.mpText.setText("");
      return;
    }
    const className =
      this.config.classes.find((entry) => entry.id === unit.classId)?.name ?? "Hero";
    this.heroName.setText(className);
    this.heroPortrait.setText(className.charAt(0));

    const x = 12;
    const y = this.scene.scale.height - 12 - 96;
    // HP bar.
    const hpRatio = Math.max(0, unit.healthPoints / unit.maxHealthPoints);
    this.bar(this.heroBars, x + 54, y + 44, 168, 16, hpRatio, this.hpColor(hpRatio), 0x20161b);
    this.hpText.setText(`${String(unit.healthPoints)} / ${String(unit.maxHealthPoints)}`);
    // AP / MP gauges — bold color-coded counters.
    this.gauge(this.heroBars, x + 54, y + 68, 80, AP_COLOR);
    this.gauge(this.heroBars, x + 142, y + 68, 80, MP_COLOR);
    this.apText.setText(`${String(unit.actionPoints)} AP`);
    this.mpText.setText(`${String(unit.movementPoints)} MP`);
  }

  private updateEnemyPanel(view: MatchView, myPlayerId: PlayerId): void {
    const enemy = view.units.find((unit) => unit.playerId !== myPlayerId && unit.alive) ?? null;
    this.enemyBar.clear();
    const visible = enemy !== null;
    this.enemyPanel.setVisible(visible);
    this.enemyName.setVisible(visible);
    this.enemyHpText.setVisible(visible);
    if (enemy === null) {
      return;
    }
    const className =
      this.config.classes.find((entry) => entry.id === enemy.classId)?.name ?? "Enemy";
    const stance =
      enemy.revealedStanceId === null
        ? ""
        : ` · ${this.config.stances.find((s) => s.id === enemy.revealedStanceId)?.name ?? ""}`;
    this.enemyName.setText(`${className}${stance}`);
    const w = 214;
    const x = this.scene.scale.width - 12 - w;
    const ratio = Math.max(0, enemy.healthPoints / enemy.maxHealthPoints);
    this.bar(this.enemyBar, x + 14, 12 + 30, w - 28, 14, ratio, this.hpColor(ratio), 0x24151a);
    this.enemyHpText.setText(`${String(enemy.healthPoints)} / ${String(enemy.maxHealthPoints)}`);
  }

  private updateSkillBar(
    unit: UnitView | null,
    selectedSpellId: SpellId | null,
    isMyTurn: boolean,
    canCast: boolean,
  ): void {
    for (const slot of this.slots) {
      const tint = ELEMENT_TINT[slot.spell.element] ?? 0xbcd4ff;
      const affordable = unit !== null && unit.actionPoints >= slot.spell.actionPointCost;
      const usable = isMyTurn && canCast && affordable;
      const selected = slot.spell.id === selectedSpellId;

      slot.frame.clear();
      const bodyAlpha = usable ? 1 : 0.45;
      slot.frame.fillStyle(0x101826, 0.96);
      slot.frame.fillRoundedRect(slot.x, slot.y, SLOT_SIZE, SLOT_SIZE, 10);
      slot.frame.fillStyle(tint, usable ? 0.22 : 0.1);
      slot.frame.fillRoundedRect(slot.x, slot.y, SLOT_SIZE, SLOT_SIZE, 10);
      slot.frame.lineStyle(selected ? 3 : 1.5, selected ? 0xffe066 : tint, usable ? 0.95 : 0.5);
      slot.frame.strokeRoundedRect(slot.x, slot.y, SLOT_SIZE, SLOT_SIZE, 10);

      slot.glyph.setAlpha(bodyAlpha);
      if (slot.glyph instanceof Phaser.GameObjects.Text) {
        slot.glyph.setColor(usable ? "#f4f8ff" : "#7d8aa2");
      }
      // Red cost when you can't afford it; dim when it's simply not your turn.
      slot.cost.setColor(!affordable && isMyTurn ? "#ff7a7a" : usable ? "#eaf2ff" : "#8fa0bd");
    }
  }

  private updateDetail(isMyTurn: boolean, canCast: boolean, selectedSpellId: SpellId | null): void {
    const detailSpellId = this.hoveredSpellId ?? selectedSpellId;
    const detailSpell =
      detailSpellId === null
        ? null
        : (this.config.spells.find((spell) => spell.id === detailSpellId) ?? null);
    this.detailText.setText(
      isMyTurn && !canCast
        ? "Electrified — cannot cast this turn."
        : detailSpell !== null
          ? describeSpell(detailSpell, this.config)
          : isMyTurn
            ? "Click a highlighted tile to move, or pick a spell."
            : "",
    );
  }

  private updateTurnClock(view: MatchView, isMyTurn: boolean, stanceLocked: boolean): void {
    let key = "none";
    let seconds = 0;
    let prefix = "";
    if (view.phase === "StanceSelection") {
      key = stanceLocked ? "stance-locked" : "stance";
      seconds = this.config.timers.stanceSelectionSeconds;
      prefix = stanceLocked ? "Waiting…" : "Choose stance";
    } else if (view.phase === "UnitTurns" && view.activeUnitId !== null) {
      key = `turn:${view.activeUnitId}`;
      seconds = this.config.timers.unitTurnSeconds;
      prefix = isMyTurn ? "Your turn" : "Opponent";
    }
    this.turnPrefix = prefix;
    if (key !== this.lastTurnKey) {
      this.lastTurnKey = key;
      this.turnStartMs = this.scene.time.now;
      this.turnSeconds = seconds;
    }
    this.tickTimer();
  }

  private tickTimer(): void {
    this.turnText.setText(this.turnPrefix);
    this.clockRing.clear();
    if (this.turnPrefix === "" || this.turnSeconds === 0) {
      this.clockSeconds.setText("");
      return;
    }
    const cx = this.scene.scale.width / 2;
    const elapsed = (this.scene.time.now - this.turnStartMs) / 1000;
    const remaining = Math.max(0, Math.ceil(this.turnSeconds - elapsed));
    const fraction = Math.max(0, Math.min(1, (this.turnSeconds - elapsed) / this.turnSeconds));
    const urgent = remaining <= 5;
    const color = urgent ? 0xff5a5a : 0x3f8ae0;

    this.clockRing.lineStyle(4, 0x22304a, 1);
    this.clockRing.strokeCircle(cx, CLOCK_CY, CLOCK_R);
    if (fraction > 0) {
      const start = Phaser.Math.DegToRad(-90);
      this.clockRing.lineStyle(4, color, 1);
      this.clockRing.beginPath();
      this.clockRing.arc(cx, CLOCK_CY, CLOCK_R, start, start + Math.PI * 2 * fraction, false);
      this.clockRing.strokePath();
    }
    this.clockSeconds.setText(String(remaining));
    this.clockSeconds.setColor(urgent ? "#ff8a8a" : "#e8eefc");
    // Under 5s the number blinks to draw the eye.
    this.clockSeconds.setAlpha(
      urgent && Math.floor(this.scene.time.now / 400) % 2 === 0 ? 0.35 : 1,
    );
  }

  /** A framed panel: dark fill with a hairline border. */
  private panel(x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(1000);
    g.fillStyle(PANEL_BG, 0.92);
    g.fillRoundedRect(x, y, w, h, 12);
    g.lineStyle(1, PANEL_BORDER, 0.9);
    g.strokeRoundedRect(x, y, w, h, 12);
    return g;
  }

  /** A value bar: dark track with a colored fill proportional to ratio. */
  private bar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
    fill: number,
    track: number,
  ): void {
    g.fillStyle(track, 1);
    g.fillRoundedRect(x, y, w, h, h / 2);
    if (ratio > 0) {
      g.fillStyle(fill, 1);
      g.fillRoundedRect(x, y, Math.max(h, w * ratio), h, h / 2);
    }
  }

  /** A rounded pill behind an AP or MP counter, in that resource's color. */
  private gauge(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    color: number,
  ): void {
    g.fillStyle(color, 0.16);
    g.fillRoundedRect(x, y, w, 20, 8);
    g.lineStyle(1.5, color, 0.9);
    g.strokeRoundedRect(x, y, w, 20, 8);
  }

  private hpColor(ratio: number): number {
    return ratio > 0.5 ? 0x3faf6b : ratio > 0.25 ? 0xe0a83a : 0xe24b4a;
  }

  /** Placeholder glyph until a generated icon exists: the spell's initial. */
  private glyphLabel(spell: SpellConfig): string {
    return spell.name.charAt(0).toUpperCase();
  }

  private text(
    x: number,
    y: number,
    value: string,
    size: number | Phaser.Types.GameObjects.Text.TextStyle,
    color?: string,
  ): Phaser.GameObjects.Text {
    const style: Phaser.Types.GameObjects.Text.TextStyle =
      typeof size === "number"
        ? { fontSize: `${String(size)}px`, color: color ?? "#e8eefc", lineSpacing: 4 }
        : size;
    return this.scene.add.text(x, y, value, style).setScrollFactor(0).setDepth(1000);
  }

  /**
   * Stance selection is the signature decision of the round, so every option
   * states its rule effect permanently — no hovering required.
   */
  private buildStancePanel(): void {
    const { width, height } = this.scene.scale;
    const rowHeight = 42;
    const panelHeight = 74 + this.config.stances.length * rowHeight;
    const panelTop = height / 2 - panelHeight / 2;

    const backdrop = this.scene.add
      .rectangle(width / 2, panelTop + panelHeight / 2, 660, panelHeight, 0x0e1420, 0.94)
      .setStrokeStyle(1, 0x4e8cff, 0.5)
      .setScrollFactor(0)
      .setDepth(1500);
    this.stancePanel.push(backdrop);

    this.stancePanel.push(
      this.text(width / 2, panelTop + 20, "Choose your stance", 18, "#e8eefc")
        .setOrigin(0.5, 0.5)
        .setDepth(1501),
    );
    this.stancePanel.push(
      this.text(
        width / 2,
        panelTop + 44,
        "Secret until both players have committed.",
        12,
        "#8fa0bd",
      )
        .setOrigin(0.5, 0.5)
        .setDepth(1501),
    );

    this.config.stances.forEach((stance, index) => {
      const rowY = panelTop + 78 + index * rowHeight;
      const button = this.scene.add
        .text(width / 2 - 310, rowY, stance.name, {
          fontSize: "14px",
          color: "#e8eefc",
          backgroundColor: "#2a3a55",
          padding: { x: 10, y: 6 },
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(1501)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.callbacks.onStanceChosen(stance.id);
        });
      this.stancePanel.push(button);
      this.stancePanel.push(
        this.text(width / 2 - 150, rowY, stance.description, 13, "#a9b7d0")
          .setOrigin(0, 0.5)
          .setDepth(1501),
      );
    });
  }

  private setStanceVisible(visible: boolean): void {
    for (const element of this.stancePanel) {
      if (
        element instanceof Phaser.GameObjects.Rectangle ||
        element instanceof Phaser.GameObjects.Text
      ) {
        element.setVisible(visible);
      }
    }
  }

  showMessage(text: string): void {
    this.messageText.setText(text);
    this.messageTimer?.remove();
    this.messageTimer = this.scene.time.delayedCall(2500, () => {
      this.messageText.setText("");
    });
  }

  showBanner(text: string): void {
    const { width, height } = this.scene.scale;
    this.scene.add
      .text(width / 2, height / 2, text, {
        fontSize: "36px",
        color: "#ffffff",
        backgroundColor: "#00000088",
        padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(2000);
  }
}

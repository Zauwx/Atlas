import Phaser from "phaser";
import type { GameConfig, PlayerId, SpellId, StanceId } from "@atlas/shared";
import type { MatchView, UnitView } from "../state/match-view.js";
import { describeSpell } from "./describe.js";

/**
 * Minimal in-canvas HUD: status readout, stance panel, spell bar, End Turn
 * button, message line.
 *
 * GAME_DESIGN.md "Design Principles": important information must be
 * visible. Every stance and spell shows what it actually does, read from
 * configuration — new content is explained automatically, with no UI change.
 */

export interface HudCallbacks {
  onEndTurn(): void;
  onSpellToggled(spellId: SpellId): void;
  onStanceChosen(stanceId: StanceId): void;
}

const BUTTON_STYLE = {
  fontSize: "14px",
  color: "#e8eefc",
  backgroundColor: "#2a3a55",
  padding: { x: 10, y: 6 },
} as const;

const BUTTON_SELECTED_COLOR = "#4e8cff";
const BUTTON_IDLE_COLOR = "#2a3a55";

export class Hud {
  private statusText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private endTurnButton!: Phaser.GameObjects.Text;
  private readonly spellButtons = new Map<SpellId, Phaser.GameObjects.Text>();
  private readonly stancePanel: Phaser.GameObjects.GameObject[] = [];
  private messageTimer: Phaser.Time.TimerEvent | null = null;
  private hoveredSpellId: SpellId | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: GameConfig,
    private readonly callbacks: HudCallbacks,
  ) {}

  build(ownClassSpellIds: readonly SpellId[]): void {
    const { width, height } = this.scene.scale;

    this.statusText = this.scene.add
      .text(12, 10, "", { fontSize: "14px", color: "#dce3f0", lineSpacing: 4 })
      .setScrollFactor(0)
      .setDepth(1000);

    this.messageText = this.scene.add
      .text(width / 2, height - 108, "", { fontSize: "14px", color: "#ffd27a" })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(1000);

    // Explains the spell under the cursor, or the selected one.
    this.detailText = this.scene.add
      .text(12, height - 54, "", { fontSize: "13px", color: "#a9b7d0" })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(1000);

    this.endTurnButton = this.scene.add
      .text(width - 12, height - 16, "End Turn", BUTTON_STYLE)
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.callbacks.onEndTurn();
      });

    let spellX = 12;
    for (const spellId of ownClassSpellIds) {
      const spell = this.config.spells.find((candidate) => candidate.id === spellId);
      if (spell === undefined) {
        continue;
      }
      const button = this.scene.add
        .text(
          spellX,
          height - 16,
          `${spell.name} (${String(spell.actionPointCost)} AP)`,
          BUTTON_STYLE,
        )
        .setOrigin(0, 1)
        .setScrollFactor(0)
        .setDepth(1000)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.callbacks.onSpellToggled(spell.id);
        })
        .on("pointerover", () => {
          this.hoveredSpellId = spell.id;
          this.detailText.setText(describeSpell(spell, this.config));
        })
        .on("pointerout", () => {
          if (this.hoveredSpellId === spell.id) {
            this.hoveredSpellId = null;
          }
        });
      this.spellButtons.set(spell.id, button);
      spellX += button.width + 8;
    }

    this.buildStancePanel();
  }

  /**
   * Stance selection is the signature decision of the round, so every
   * option states its rule effect permanently — no hovering required.
   */
  private buildStancePanel(): void {
    const { width, height } = this.scene.scale;
    const rowHeight = 42;
    const panelHeight = 74 + this.config.stances.length * rowHeight;
    const panelTop = height / 2 - panelHeight / 2;

    const backdrop = this.scene.add
      .rectangle(width / 2, panelTop + panelHeight / 2, 660, panelHeight, 0x0e1420, 0.92)
      .setStrokeStyle(1, 0x4e8cff, 0.5)
      .setScrollFactor(0)
      .setDepth(1500);
    this.stancePanel.push(backdrop);

    const title = this.scene.add
      .text(width / 2, panelTop + 20, "Choose your stance", {
        fontSize: "18px",
        color: "#e8eefc",
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(1501);
    this.stancePanel.push(title);

    const subtitle = this.scene.add
      .text(width / 2, panelTop + 44, "Secret until both players have committed.", {
        fontSize: "12px",
        color: "#8fa0bd",
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(1501);
    this.stancePanel.push(subtitle);

    this.config.stances.forEach((stance, index) => {
      const rowY = panelTop + 78 + index * rowHeight;
      const button = this.scene.add
        .text(width / 2 - 310, rowY, stance.name, BUTTON_STYLE)
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(1501)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.callbacks.onStanceChosen(stance.id);
        });
      this.stancePanel.push(button);

      const description = this.scene.add
        .text(width / 2 - 150, rowY, stance.description, {
          fontSize: "13px",
          color: "#a9b7d0",
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(1501);
      this.stancePanel.push(description);
    });
  }

  update(
    view: MatchView,
    myPlayerId: PlayerId,
    myUnit: UnitView | null,
    selectedSpellId: SpellId | null,
    stanceLocked: boolean,
  ): void {
    const isMyTurn =
      view.phase === "UnitTurns" && myUnit !== null && view.activeUnitId === myUnit.id;

    const lines = [
      `Round ${String(view.roundNumber)} — ${view.phase}`,
      myUnit === null
        ? "You have no living unit."
        : `HP ${String(myUnit.healthPoints)}/${String(myUnit.maxHealthPoints)}   AP ${String(myUnit.actionPoints)}   MP ${String(myUnit.movementPoints)}`,
      this.describeUnitStates(myUnit),
      view.phase === "UnitTurns"
        ? view.activeUnitId === null
          ? ""
          : isMyTurn
            ? "Your turn."
            : "Opponent's turn."
        : view.phase === "StanceSelection"
          ? stanceLocked
            ? "Stance locked. Waiting for opponent…"
            : "Choose your stance."
          : "",
    ];
    this.statusText.setText(lines.filter((line) => line.length > 0).join("\n"));

    this.endTurnButton.setVisible(isMyTurn);
    for (const [spellId, button] of this.spellButtons) {
      button.setVisible(isMyTurn);
      button.setStyle({
        backgroundColor: spellId === selectedSpellId ? BUTTON_SELECTED_COLOR : BUTTON_IDLE_COLOR,
      });
    }

    const detailSpellId = this.hoveredSpellId ?? selectedSpellId;
    const detailSpell =
      detailSpellId === null
        ? null
        : (this.config.spells.find((spell) => spell.id === detailSpellId) ?? null);
    this.detailText.setVisible(isMyTurn);
    this.detailText.setText(
      detailSpell !== null
        ? describeSpell(detailSpell, this.config)
        : isMyTurn
          ? "Click a highlighted tile to move, or pick a spell to see its range."
          : "",
    );

    const showStances = view.phase === "StanceSelection" && !stanceLocked;
    for (const element of this.stancePanel) {
      if (
        element instanceof Phaser.GameObjects.Rectangle ||
        element instanceof Phaser.GameObjects.Text
      ) {
        element.setVisible(showStances);
      }
    }
    void myPlayerId;
  }

  /** Active states matter to every decision, so they are always on screen. */
  private describeUnitStates(unit: UnitView | null): string {
    if (unit === null || unit.states.length === 0) {
      return "";
    }
    const names = unit.states.map((instance) => {
      const state = this.config.states.find((candidate) => candidate.id === instance.stateId);
      const label = state?.name ?? instance.stateId;
      return `${label} (${String(instance.remainingDuration)})`;
    });
    return `Affected by: ${names.join(", ")}`;
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

import Phaser from "phaser";
import type { GameConfig, PlayerId, SpellId, StanceId } from "@atlas/shared";
import type { MatchView, UnitView } from "../state/match-view.js";

/**
 * Minimal in-canvas HUD: status readout, spell bar, stance picker,
 * End Turn button, message line. Placeholder styling only.
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
  private endTurnButton!: Phaser.GameObjects.Text;
  private readonly spellButtons = new Map<SpellId, Phaser.GameObjects.Text>();
  private readonly stanceButtons = new Map<StanceId, Phaser.GameObjects.Text>();
  private messageTimer: Phaser.Time.TimerEvent | null = null;

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
      .text(width / 2, height - 96, "", { fontSize: "14px", color: "#ffd27a" })
      .setOrigin(0.5, 0.5)
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
        });
      this.spellButtons.set(spell.id, button);
      spellX += button.width + 8;
    }

    let stanceX = 12;
    for (const stance of this.config.stances) {
      const button = this.scene.add
        .text(stanceX, height - 52, `Stance: ${stance.name}`, BUTTON_STYLE)
        .setOrigin(0, 1)
        .setScrollFactor(0)
        .setDepth(1000)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.callbacks.onStanceChosen(stance.id);
        });
      this.stanceButtons.set(stance.id, button);
      stanceX += button.width + 8;
    }
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
    const showStances = view.phase === "StanceSelection" && !stanceLocked;
    for (const button of this.stanceButtons.values()) {
      button.setVisible(showStances);
    }
    void myPlayerId;
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

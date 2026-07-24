import type { ClassConfig, ClassId, GameConfig } from "@atlas/shared";
import { describeSpell } from "./describe.js";

/**
 * Pre-match class picker, rendered in the DOM before connecting so the
 * choice can travel with the join request.
 *
 * Cards are built from configuration — stats, description, and each
 * spell's own summary — so a new class appears here with no UI change.
 */

export function summarizeClass(gameClass: ClassConfig): string {
  return `HP ${String(gameClass.baseHealthPoints)} · AP ${String(gameClass.baseActionPoints)} · MP ${String(gameClass.baseMovementPoints)}`;
}

export function chooseClass(config: GameConfig): Promise<ClassId | undefined> {
  const panel = document.getElementById("class-select");
  const options = document.getElementById("class-options");
  if (panel === null || options === null || config.classes.length === 0) {
    return Promise.resolve(undefined);
  }

  panel.hidden = false;
  return new Promise((resolve) => {
    for (const gameClass of config.classes) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "class-card";

      const title = document.createElement("h2");
      title.textContent = gameClass.name;
      card.append(title);

      const stats = document.createElement("div");
      stats.className = "stats";
      stats.textContent = summarizeClass(gameClass);
      card.append(stats);

      const description = document.createElement("div");
      description.className = "desc";
      description.textContent = gameClass.description;
      card.append(description);

      const spells = document.createElement("ul");
      for (const spellId of gameClass.spellIds) {
        const spell = config.spells.find((candidate) => candidate.id === spellId);
        if (spell === undefined) {
          continue;
        }
        const item = document.createElement("li");
        item.textContent = describeSpell(spell, config);
        spells.append(item);
      }
      card.append(spells);

      card.addEventListener("click", () => {
        panel.hidden = true;
        options.replaceChildren();
        resolve(gameClass.id);
      });
      options.append(card);
    }
  });
}

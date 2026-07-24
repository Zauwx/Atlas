import type { CellCoord, GameEvent } from "@atlas/shared";
import type { CellRuntime, MatchState, UnitRuntime } from "./match-state.js";
import { coordOf, isBottomless } from "./board.js";
import { applyTerrainOnEnter } from "./terrain.js";

/**
 * Falls — COMBAT_RULEBOOK.md "Falls".
 * Damage = (z_start − z_end) × physics.fallDamagePerHeightLevel, computed
 * once. Falling into bottomless terrain produces no Fall event and no
 * damage number; the Death event reports the outcome (rulebook "Void").
 */
export function applyFall(
  state: MatchState,
  unit: UnitRuntime,
  from: CellCoord,
  toCell: CellRuntime,
  events: GameEvent[],
): void {
  unit.position = coordOf(toCell);

  if (isBottomless(state, toCell)) {
    unit.fellIntoBottomless = true;
    return;
  }

  const heightFallen = from.z - toCell.z;
  const damage = heightFallen * state.config.physics.fallDamagePerHeightLevel;
  unit.currentHealthPoints -= damage;
  events.push({ type: "Fall", unitId: unit.id, from, to: coordOf(toCell), damage });

  applyTerrainOnEnter(state, unit, toCell, events);
}

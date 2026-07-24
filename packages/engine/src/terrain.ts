import type { GameEvent } from "@atlas/shared";
import type { CellRuntime, MatchState, UnitRuntime } from "./match-state.js";
import { applyStateToUnit } from "./states.js";

/**
 * Terrain behavior — COMBAT_RULEBOOK.md "Terrain": terrain applies its
 * configured states each time a unit enters the cell; durations come from
 * configuration. Bottomless terrain marks the unit for death at the next
 * death check (rulebook "Falls → Void").
 */
export function applyTerrainOnEnter(
  state: MatchState,
  unit: UnitRuntime,
  cell: CellRuntime,
  events: GameEvent[],
): void {
  const terrain = state.registries.terrainById.get(cell.terrainId);
  if (terrain === undefined) {
    throw new Error(
      `Unknown terrain "${cell.terrainId}" at (${String(cell.x)}, ${String(cell.y)})`,
    );
  }
  if (terrain.bottomless) {
    unit.fellIntoBottomless = true;
    return;
  }
  for (const stateId of terrain.appliedStateIds) {
    applyStateToUnit(unit, stateId, terrain.appliedStateDurationRounds, null, null, events);
  }
}

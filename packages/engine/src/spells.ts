import type {
  CastSpellIntent,
  Direction,
  GameEvent,
  IntentErrorCode,
  PlayerId,
  SpellConfig,
  SpellEffectConfig,
} from "@atlas/shared";
import type { MatchState, UnitRuntime } from "./match-state.js";
import { cellAt, isInBounds, livingUnitAt, manhattanDistance, unitById } from "./board.js";
import { applyHeal, applySpellDamage } from "./combat.js";
import { hasLineOfSight } from "./line-of-sight.js";
import { resolvePush } from "./push.js";
import type { RuleModifierRegistry } from "./rules.js";
import { applyStateToCell, applyStateToUnit } from "./states.js";
import { applyTerrainOnEnter } from "./terrain.js";

/**
 * Spell resolution — COMBAT_RULEBOOK.md "Resolution Pipeline".
 *
 * Effects are executed grouped by pipeline step, NEVER in configuration
 * order: pushes (steps 8–10), physical damage and heals (step 11),
 * elemental damage (step 12), state application (step 13), terrain
 * transformation (step 14). Steps 15–16 (elemental propagation, deferred
 * effects) are no-ops until the rulebook defines their content.
 */

export type CastOutcome =
  { readonly ok: true } | { readonly ok: false; readonly code: IntentErrorCode };

export function tryCastSpell(
  state: MatchState,
  registry: RuleModifierRegistry,
  playerId: PlayerId,
  intent: CastSpellIntent,
  events: GameEvent[],
): CastOutcome {
  // Step 1 — validation.
  if (state.phase === "Finished") {
    return { ok: false, code: "MatchNotActive" };
  }
  if (state.phase !== "UnitTurns") {
    return { ok: false, code: "NotYourTurn" };
  }
  const caster = unitById(state, intent.unitId);
  if (!caster?.alive) {
    return { ok: false, code: "UnknownUnit" };
  }
  const activeId = state.initiativeOrder[state.activeInitiativeIndex];
  if (caster.playerId !== playerId || activeId !== caster.id) {
    return { ok: false, code: "NotYourTurn" };
  }
  const spell = state.registries.spellById.get(intent.spellId);
  const casterClass = state.registries.classById.get(caster.classId);
  if (spell === undefined || !casterClass?.spellIds.includes(spell.id)) {
    return { ok: false, code: "UnknownSpell" };
  }
  if (caster.currentActionPoints < spell.actionPointCost) {
    return { ok: false, code: "NotEnoughActionPoints" };
  }
  if (!isInBounds(state, intent.target.x, intent.target.y)) {
    return { ok: false, code: "OutOfBounds" };
  }
  const targetCell = cellAt(state, intent.target.x, intent.target.y);
  if (targetCell.z !== intent.target.z) {
    return { ok: false, code: "InvalidTarget" };
  }
  const range = manhattanDistance(caster.position, intent.target);
  if (range < spell.minRange || range > spell.maxRange) {
    return { ok: false, code: "OutOfRange" };
  }
  if (spell.requiresLineOfSight && !hasLineOfSight(state, caster.position, intent.target)) {
    return { ok: false, code: "NoLineOfSight" };
  }
  const pushDirection = derivePushDirection(caster, intent);
  if (spellHasPush(spell) && pushDirection === null) {
    // Rulebook Edge Cases: push targets must be axis-aligned and distinct.
    return { ok: false, code: "InvalidTarget" };
  }

  // Step 2 — cost payment.
  caster.currentActionPoints -= spell.actionPointCost;

  // Step 3 — target selection, locked for the whole resolution.
  const targetUnit = livingUnitAt(state, intent.target.x, intent.target.y);

  // Steps 4–5 — stance and terrain modifier hooks (registry-driven; the
  // push distance hook applies inside resolvePush).

  // Steps 8–10 — pushes, collisions, falls.
  if (targetUnit !== null && pushDirection !== null) {
    for (const effect of effectsOfKind(spell, "Push")) {
      if (targetUnit.alive && !targetUnit.fellIntoBottomless) {
        resolvePush(state, registry, caster, targetUnit, pushDirection, effect.distance, events);
      }
    }
  }

  // Step 11 — direct (Physical) damage, then heals (rulebook Edge Cases).
  if (targetUnit !== null) {
    for (const effect of effectsOfKind(spell, "Damage")) {
      if (effect.element === "Physical") {
        applySpellDamage(
          state,
          targetUnit,
          effect.amount,
          effect.element,
          caster.id,
          spell.id,
          events,
        );
      }
    }
    for (const effect of effectsOfKind(spell, "Heal")) {
      applyHeal(state, targetUnit, effect.amount, caster.id, spell.id, events);
    }
    // Step 12 — elemental damage.
    for (const effect of effectsOfKind(spell, "Damage")) {
      if (effect.element !== "Physical") {
        applySpellDamage(
          state,
          targetUnit,
          effect.amount,
          effect.element,
          caster.id,
          spell.id,
          events,
        );
      }
    }
  }

  // Step 13 — state application (falls back to the cell when unoccupied).
  for (const effect of effectsOfKind(spell, "ApplyState")) {
    if (targetUnit !== null) {
      applyStateToUnit(targetUnit, effect.stateId, effect.duration, caster.id, spell.id, events);
    } else {
      applyStateToCell(targetCell, effect.stateId, effect.duration, caster.id, spell.id, events);
    }
  }

  // Step 14 — terrain transformation.
  for (const effect of effectsOfKind(spell, "TransformTerrain")) {
    if (targetCell.terrainId !== effect.toTerrainId) {
      const fromTerrainId = targetCell.terrainId;
      targetCell.terrainId = effect.toTerrainId;
      events.push({
        type: "TerrainChanged",
        at: { x: targetCell.x, y: targetCell.y, z: targetCell.z },
        fromTerrainId,
        toTerrainId: effect.toTerrainId,
      });
      // Rulebook Edge Cases: the new terrain applies to the occupant.
      const occupant = livingUnitAt(state, targetCell.x, targetCell.y);
      if (occupant !== null) {
        applyTerrainOnEnter(state, occupant, targetCell, events);
      }
    }
  }

  // Steps 15–16 — elemental propagation and deferred effects: no rules
  // defined yet (rulebook Open Questions); deliberately no-ops.

  return { ok: true };
}

function spellHasPush(spell: SpellConfig): boolean {
  return spell.effects.some((effect) => effect.kind === "Push");
}

type EffectOfKind<K extends SpellEffectConfig["kind"]> = Extract<SpellEffectConfig, { kind: K }>;

function effectsOfKind<K extends SpellEffectConfig["kind"]>(
  spell: SpellConfig,
  kind: K,
): EffectOfKind<K>[] {
  return spell.effects.filter((effect): effect is EffectOfKind<K> => effect.kind === kind);
}

function derivePushDirection(caster: UnitRuntime, intent: CastSpellIntent): Direction | null {
  const dx = intent.target.x - caster.position.x;
  const dy = intent.target.y - caster.position.y;
  if (dx !== 0 && dy !== 0) {
    return null;
  }
  if (dx > 0) {
    return "East";
  }
  if (dx < 0) {
    return "West";
  }
  if (dy > 0) {
    return "South";
  }
  if (dy < 0) {
    return "North";
  }
  return null;
}

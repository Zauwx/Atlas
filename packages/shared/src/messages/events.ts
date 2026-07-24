import { z } from "zod";
import { CellCoordSchema } from "../board/coordinates.js";
import { DirectionSchema } from "../enums/direction.js";
import { ElementSchema } from "../enums/element.js";
import {
  PlayerIdSchema,
  SpellIdSchema,
  StanceIdSchema,
  StateIdSchema,
  TerrainIdSchema,
  UnitIdSchema,
} from "../ids.js";

/**
 * Game events — COMBAT_RULEBOOK.md "Event Journal".
 *
 * Events are the only gameplay data the server sends to clients. They
 * reflect only actions already validated and resolved by the server; the
 * client never invents an event. The same stream feeds rendering, replays,
 * spectator mode, and debugging.
 */

/** Target of a state application/removal: states live on units AND on cells. */
export const StateTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("Unit"), unitId: UnitIdSchema }),
  z.object({ kind: z.literal("Cell"), coord: CellCoordSchema }),
]);
export type StateTarget = z.infer<typeof StateTargetSchema>;

// --- Combat events (rulebook combat vocabulary) ---

export const MoveEventSchema = z.object({
  type: z.literal("Move"),
  unitId: UnitIdSchema,
  /** Cells entered, in order, excluding the starting cell. */
  path: z.array(CellCoordSchema).min(1),
});

export const PushEventSchema = z.object({
  type: z.literal("Push"),
  unitId: UnitIdSchema,
  direction: DirectionSchema,
  from: CellCoordSchema,
  to: CellCoordSchema,
});

export const CollisionEventSchema = z.object({
  type: z.literal("Collision"),
  unitId: UnitIdSchema,
  at: CellCoordSchema,
  /** Push cells not traversed; damage = remainingCells × physics.collisionDamagePerRemainingCell. */
  remainingCells: z.number().int().positive(),
  damage: z.number().int().nonnegative(),
});

export const FallEventSchema = z.object({
  type: z.literal("Fall"),
  unitId: UnitIdSchema,
  from: CellCoordSchema,
  to: CellCoordSchema,
  /** damage = (from.z − to.z) × physics.fallDamagePerHeightLevel, computed once. */
  damage: z.number().int().nonnegative(),
});

export const DamageEventSchema = z.object({
  type: z.literal("Damage"),
  targetUnitId: UnitIdSchema,
  amount: z.number().int().nonnegative(),
  element: ElementSchema,
  sourceUnitId: UnitIdSchema.nullable(),
  sourceSpellId: SpellIdSchema.nullable(),
});

export const HealEventSchema = z.object({
  type: z.literal("Heal"),
  targetUnitId: UnitIdSchema,
  amount: z.number().int().nonnegative(),
  sourceUnitId: UnitIdSchema.nullable(),
  sourceSpellId: SpellIdSchema.nullable(),
});

export const ApplyStateEventSchema = z.object({
  type: z.literal("ApplyState"),
  stateId: StateIdSchema,
  target: StateTargetSchema,
  duration: z.number().int().positive(),
});

export const RemoveStateEventSchema = z.object({
  type: z.literal("RemoveState"),
  stateId: StateIdSchema,
  target: StateTargetSchema,
});

export const TerrainChangedEventSchema = z.object({
  type: z.literal("TerrainChanged"),
  at: CellCoordSchema,
  fromTerrainId: TerrainIdSchema,
  toTerrainId: TerrainIdSchema,
});

export const DeathEventSchema = z.object({
  type: z.literal("Death"),
  unitId: UnitIdSchema,
});

export const VictoryEventSchema = z.object({
  type: z.literal("Victory"),
  /**
   * Winner of the match. Draw handling is an open rulebook question
   * (simultaneous deaths); this schema will be revised when it is decided.
   */
  winnerPlayerId: PlayerIdSchema,
});

// --- Flow events (rulebook flow vocabulary) ---

export const RoundStartedEventSchema = z.object({
  type: z.literal("RoundStarted"),
  roundNumber: z.number().int().positive(),
});

export const StanceRevealedEventSchema = z.object({
  type: z.literal("StanceRevealed"),
  /**
   * The simultaneous reveal (rulebook Round Structure step 5). One event per
   * player, all emitted at the same simulation step — this is the only way
   * stance information ever reaches a client.
   */
  playerId: PlayerIdSchema,
  stanceId: StanceIdSchema,
});

export const TurnStartedEventSchema = z.object({
  type: z.literal("TurnStarted"),
  unitId: UnitIdSchema,
});

export const TurnEndedEventSchema = z.object({
  type: z.literal("TurnEnded"),
  unitId: UnitIdSchema,
});

// --- Union ---

export const GameEventSchema = z.discriminatedUnion("type", [
  MoveEventSchema,
  PushEventSchema,
  CollisionEventSchema,
  FallEventSchema,
  DamageEventSchema,
  HealEventSchema,
  ApplyStateEventSchema,
  RemoveStateEventSchema,
  TerrainChangedEventSchema,
  DeathEventSchema,
  VictoryEventSchema,
  RoundStartedEventSchema,
  StanceRevealedEventSchema,
  TurnStartedEventSchema,
  TurnEndedEventSchema,
]);
export type GameEvent = z.infer<typeof GameEventSchema>;

export const GameEventTypeSchema = z.enum([
  "Move",
  "Push",
  "Collision",
  "Fall",
  "Damage",
  "Heal",
  "ApplyState",
  "RemoveState",
  "TerrainChanged",
  "Death",
  "Victory",
  "RoundStarted",
  "StanceRevealed",
  "TurnStarted",
  "TurnEnded",
]);
export type GameEventType = z.infer<typeof GameEventTypeSchema>;
export const GameEventType = GameEventTypeSchema.enum;

export type MoveEvent = z.infer<typeof MoveEventSchema>;
export type PushEvent = z.infer<typeof PushEventSchema>;
export type CollisionEvent = z.infer<typeof CollisionEventSchema>;
export type FallEvent = z.infer<typeof FallEventSchema>;
export type DamageEvent = z.infer<typeof DamageEventSchema>;
export type HealEvent = z.infer<typeof HealEventSchema>;
export type ApplyStateEvent = z.infer<typeof ApplyStateEventSchema>;
export type RemoveStateEvent = z.infer<typeof RemoveStateEventSchema>;
export type TerrainChangedEvent = z.infer<typeof TerrainChangedEventSchema>;
export type DeathEvent = z.infer<typeof DeathEventSchema>;
export type VictoryEvent = z.infer<typeof VictoryEventSchema>;
export type RoundStartedEvent = z.infer<typeof RoundStartedEventSchema>;
export type StanceRevealedEvent = z.infer<typeof StanceRevealedEventSchema>;
export type TurnStartedEvent = z.infer<typeof TurnStartedEventSchema>;
export type TurnEndedEvent = z.infer<typeof TurnEndedEventSchema>;

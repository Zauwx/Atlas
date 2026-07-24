import type {
  CellCoord,
  ClassConfig,
  ClassId,
  GameConfig,
  GameEvent,
  MatchPhase,
  MatchSetup,
  PlayerId,
  SpellConfig,
  SpellId,
  StanceConfig,
  StanceId,
  StateConfig,
  StateId,
  StateInstance,
  TerrainConfig,
  TerrainId,
  UnitId,
} from "@atlas/shared";
import { findGameConfigReferenceErrors, GameConfigSchema, MatchSetupSchema } from "@atlas/shared";

/**
 * Internal runtime state of a match. Mutable by design: the simulation owns
 * it exclusively and mutates it through the engine modules only. Everything
 * observable leaves the engine as events or snapshots.
 */

export interface UnitRuntime {
  readonly id: UnitId;
  readonly playerId: PlayerId;
  readonly classId: ClassId;
  position: CellCoord;
  currentHealthPoints: number;
  readonly maxHealthPoints: number;
  currentActionPoints: number;
  currentMovementPoints: number;
  states: StateInstance[];
  revealedStanceId: StanceId | null;
  alive: boolean;
  /** Entered bottomless terrain: death at the next death check, regardless of HP. */
  fellIntoBottomless: boolean;
}

export interface CellRuntime {
  readonly x: number;
  readonly y: number;
  /** Ground height. Static: terrain transformation never changes z. */
  readonly z: number;
  terrainId: TerrainId;
  states: StateInstance[];
}

/** O(1) config lookups, built once at match creation. Insertion order is deterministic. */
export interface ConfigRegistries {
  readonly terrainById: ReadonlyMap<TerrainId, TerrainConfig>;
  readonly stateById: ReadonlyMap<StateId, StateConfig>;
  readonly stanceById: ReadonlyMap<StanceId, StanceConfig>;
  readonly classById: ReadonlyMap<ClassId, ClassConfig>;
  readonly spellById: ReadonlyMap<SpellId, SpellConfig>;
}

export interface MatchState {
  readonly config: GameConfig;
  readonly registries: ConfigRegistries;
  readonly mapWidth: number;
  readonly mapHeight: number;
  /** Row-major: cell (x, y) lives at index y × width + x. */
  readonly cells: CellRuntime[];
  /** Creation order — the initiative rule depends on it (rulebook: Initiative). */
  readonly units: UnitRuntime[];
  /** Join order — the initiative rule depends on it. */
  readonly playerOrder: PlayerId[];
  roundNumber: number;
  phase: MatchPhase;
  initiativeOrder: UnitId[];
  activeInitiativeIndex: number;
  /**
   * SECRET (rulebook invariant): locked stance choices. Never serialized,
   * never copied into snapshots, never emitted before the reveal step.
   */
  readonly lockedStances: Map<PlayerId, StanceId>;
  readonly eventLog: GameEvent[];
}

/** Engine-level setup error: a server/programmer bug, not a player intent. */
export class MatchSetupError extends Error {}

export function createMatchState(config: GameConfig, setup: MatchSetup): MatchState {
  const parsedConfig = GameConfigSchema.safeParse(config);
  if (!parsedConfig.success) {
    throw new MatchSetupError(`Invalid game config: ${parsedConfig.error.message}`);
  }
  const referenceErrors = findGameConfigReferenceErrors(config);
  if (referenceErrors.length > 0) {
    throw new MatchSetupError(`Invalid game config: ${referenceErrors.join("; ")}`);
  }
  const parsedSetup = MatchSetupSchema.safeParse(setup);
  if (!parsedSetup.success) {
    throw new MatchSetupError(`Invalid match setup: ${parsedSetup.error.message}`);
  }

  const registries: ConfigRegistries = {
    terrainById: new Map(config.terrains.map((terrain) => [terrain.id, terrain])),
    stateById: new Map(config.states.map((state) => [state.id, state])),
    stanceById: new Map(config.stances.map((stance) => [stance.id, stance])),
    classById: new Map(config.classes.map((gameClass) => [gameClass.id, gameClass])),
    spellById: new Map(config.spells.map((spell) => [spell.id, spell])),
  };

  const cells: CellRuntime[] = setup.map.cells.map((mapCell, index) => {
    const terrain = registries.terrainById.get(mapCell.terrainId);
    if (terrain === undefined) {
      throw new MatchSetupError(`Map cell ${index}: unknown terrain "${mapCell.terrainId}"`);
    }
    return {
      x: index % setup.map.width,
      y: Math.floor(index / setup.map.width),
      z: mapCell.z,
      terrainId: mapCell.terrainId,
      states: [],
    };
  });

  const units: UnitRuntime[] = [];
  const playerOrder: PlayerId[] = [];
  const occupied = new Set<string>();
  const unitIds = new Set<string>();

  for (const player of setup.players) {
    if (playerOrder.includes(player.id)) {
      throw new MatchSetupError(`Duplicate player id "${player.id}"`);
    }
    playerOrder.push(player.id);

    for (const unitSetup of player.units) {
      if (unitIds.has(unitSetup.id)) {
        throw new MatchSetupError(`Duplicate unit id "${unitSetup.id}"`);
      }
      unitIds.add(unitSetup.id);

      const gameClass = registries.classById.get(unitSetup.classId);
      if (gameClass === undefined) {
        throw new MatchSetupError(`Unit "${unitSetup.id}": unknown class "${unitSetup.classId}"`);
      }

      const { x, y, z } = unitSetup.position;
      if (x >= setup.map.width || y >= setup.map.height) {
        throw new MatchSetupError(`Unit "${unitSetup.id}": spawn (${x}, ${y}) is out of bounds`);
      }
      const cell = cells[y * setup.map.width + x];
      if (cell?.z !== z) {
        throw new MatchSetupError(`Unit "${unitSetup.id}": spawn z does not match the map`);
      }
      const terrain = registries.terrainById.get(cell.terrainId);
      if (terrain?.bottomless === true) {
        throw new MatchSetupError(`Unit "${unitSetup.id}": cannot spawn on bottomless terrain`);
      }
      const key = `${String(x)},${String(y)}`;
      if (occupied.has(key)) {
        throw new MatchSetupError(`Unit "${unitSetup.id}": spawn cell already occupied`);
      }
      occupied.add(key);

      units.push({
        id: unitSetup.id,
        playerId: player.id,
        classId: unitSetup.classId,
        position: { x, y, z },
        currentHealthPoints: gameClass.baseHealthPoints,
        maxHealthPoints: gameClass.baseHealthPoints,
        currentActionPoints: gameClass.baseActionPoints,
        currentMovementPoints: gameClass.baseMovementPoints,
        states: [],
        revealedStanceId: null,
        alive: true,
        fellIntoBottomless: false,
      });
    }
  }

  return {
    config,
    registries,
    mapWidth: setup.map.width,
    mapHeight: setup.map.height,
    cells,
    units,
    playerOrder,
    roundNumber: 0,
    phase: "StanceSelection",
    initiativeOrder: [],
    activeInitiativeIndex: -1,
    lockedStances: new Map(),
    eventLog: [],
  };
}

import type {
  CellCoord,
  ClassConfig,
  ClassId,
  GameConfig,
  GameEvent,
  MatchPhase,
  MatchSnapshot,
  PlayerId,
  SpellConfig,
  SpellId,
  StanceId,
  StateInstance,
  TerrainId,
  UnitId,
} from "@atlas/shared";

/**
 * Display-only view of the match, folded from snapshot + events
 * (ARCHITECTURE.md "Client Rendering Decisions"). Contains NO rules: it
 * only mirrors what the server reported so the renderer and HUD have one
 * consistent source. Any drift is corrected by the next snapshot.
 */

export interface UnitView {
  readonly id: UnitId;
  readonly playerId: PlayerId;
  readonly classId: ClassId;
  position: CellCoord;
  healthPoints: number;
  readonly maxHealthPoints: number;
  actionPoints: number;
  movementPoints: number;
  states: StateInstance[];
  revealedStanceId: StanceId | null;
  alive: boolean;
}

export interface CellView {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  terrainId: TerrainId;
  states: StateInstance[];
}

export class MatchView {
  width = 0;
  height = 0;
  cells: CellView[] = [];
  units: UnitView[] = [];
  roundNumber = 0;
  phase: MatchPhase = "StanceSelection";
  activeUnitId: UnitId | null = null;
  /** Set by the Victory event; meaningful only when phase is Finished. */
  winnerPlayerId: PlayerId | null = null;

  constructor(readonly config: GameConfig) {}

  loadSnapshot(snapshot: MatchSnapshot): void {
    this.width = snapshot.board.width;
    this.height = snapshot.board.height;
    this.cells = snapshot.board.cells.map((cell) => ({
      x: cell.coord.x,
      y: cell.coord.y,
      z: cell.coord.z,
      terrainId: cell.terrainId,
      states: cell.states.map((state) => ({ ...state })),
    }));
    this.units = snapshot.units.map((unit) => ({
      id: unit.id,
      playerId: unit.playerId,
      classId: unit.classId,
      position: { ...unit.position },
      healthPoints: unit.currentHealthPoints,
      maxHealthPoints: unit.maxHealthPoints,
      actionPoints: unit.currentActionPoints,
      movementPoints: unit.currentMovementPoints,
      states: unit.states.map((state) => ({ ...state })),
      revealedStanceId: unit.revealedStanceId,
      alive: true,
    }));
    this.roundNumber = snapshot.roundNumber;
    this.phase = snapshot.phase;
    this.activeUnitId = snapshot.activeUnitId;
  }

  cellAt(x: number, y: number): CellView | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return null;
    }
    return this.cells[y * this.width + x] ?? null;
  }

  unitById(unitId: UnitId): UnitView | null {
    return this.units.find((unit) => unit.id === unitId) ?? null;
  }

  livingUnitAt(x: number, y: number): UnitView | null {
    return (
      this.units.find((unit) => unit.alive && unit.position.x === x && unit.position.y === y) ??
      null
    );
  }

  classOf(unit: UnitView): ClassConfig | null {
    return this.config.classes.find((gameClass) => gameClass.id === unit.classId) ?? null;
  }

  spellById(spellId: SpellId): SpellConfig | null {
    return this.config.spells.find((spell) => spell.id === spellId) ?? null;
  }

  /** Local AP bookkeeping after a CastSpell acknowledgment (no event carries AP). */
  noteSpellCast(unitId: UnitId, spellId: SpellId): void {
    const unit = this.unitById(unitId);
    const spell = this.spellById(spellId);
    if (unit !== null && spell !== null) {
      unit.actionPoints = Math.max(0, unit.actionPoints - spell.actionPointCost);
    }
  }

  apply(event: GameEvent): void {
    switch (event.type) {
      case "Move": {
        const unit = this.unitById(event.unitId);
        const destination = event.path.at(-1);
        if (unit === null || destination === undefined) {
          return;
        }
        let previous = unit.position;
        for (const step of event.path) {
          const climb = step.z - previous.z;
          const climbCost =
            climb > 0 ? climb * this.config.physics.climbMovementPointCostPerLevel : 0;
          unit.movementPoints = Math.max(0, unit.movementPoints - 1 - climbCost);
          previous = step;
        }
        unit.position = { ...destination };
        return;
      }
      case "Push": {
        const unit = this.unitById(event.unitId);
        if (unit !== null) {
          unit.position = { ...event.to };
        }
        return;
      }
      case "Collision": {
        const unit = this.unitById(event.unitId);
        if (unit !== null) {
          unit.healthPoints -= event.damage;
        }
        return;
      }
      case "Fall": {
        const unit = this.unitById(event.unitId);
        if (unit !== null) {
          unit.position = { ...event.to };
          unit.healthPoints -= event.damage;
        }
        return;
      }
      case "Damage": {
        const unit = this.unitById(event.targetUnitId);
        if (unit !== null) {
          unit.healthPoints -= event.amount;
        }
        return;
      }
      case "Heal": {
        const unit = this.unitById(event.targetUnitId);
        if (unit !== null) {
          unit.healthPoints = Math.min(unit.maxHealthPoints, unit.healthPoints + event.amount);
        }
        return;
      }
      case "ApplyState": {
        const states = this.statesOfTarget(event.target);
        if (states === null) {
          return;
        }
        const existing = states.find((state) => state.stateId === event.stateId);
        if (existing !== undefined) {
          existing.remainingDuration = event.duration;
        } else {
          states.push({
            stateId: event.stateId,
            remainingDuration: event.duration,
            ownerUnitId: null,
            sourceSpellId: null,
          });
        }
        return;
      }
      case "RemoveState": {
        const target = event.target;
        if (target.kind === "Unit") {
          const unit = this.unitById(target.unitId);
          if (unit !== null) {
            unit.states = unit.states.filter((state) => state.stateId !== event.stateId);
          }
        } else {
          const cell = this.cellAt(target.coord.x, target.coord.y);
          if (cell !== null) {
            cell.states = cell.states.filter((state) => state.stateId !== event.stateId);
          }
        }
        return;
      }
      case "TerrainChanged": {
        const cell = this.cellAt(event.at.x, event.at.y);
        if (cell !== null) {
          cell.terrainId = event.toTerrainId;
        }
        return;
      }
      case "Death": {
        const unit = this.unitById(event.unitId);
        if (unit !== null) {
          unit.alive = false;
        }
        return;
      }
      case "Victory": {
        this.phase = "Finished";
        this.activeUnitId = null;
        this.winnerPlayerId = event.winnerPlayerId;
        return;
      }
      case "RoundStarted": {
        this.roundNumber = event.roundNumber;
        this.activeUnitId = null;
        this.phase = this.config.stances.length > 0 ? "StanceSelection" : "UnitTurns";
        for (const unit of this.units) {
          unit.revealedStanceId = null;
        }
        return;
      }
      case "StanceRevealed": {
        for (const unit of this.units) {
          if (unit.alive && unit.playerId === event.playerId) {
            unit.revealedStanceId = event.stanceId;
          }
        }
        return;
      }
      case "TurnStarted": {
        this.phase = "UnitTurns";
        this.activeUnitId = event.unitId;
        const unit = this.unitById(event.unitId);
        if (unit !== null) {
          const gameClass = this.classOf(unit);
          if (gameClass !== null) {
            unit.actionPoints = gameClass.baseActionPoints;
            unit.movementPoints = gameClass.baseMovementPoints;
          }
        }
        return;
      }
      case "TurnEnded": {
        if (this.activeUnitId === event.unitId) {
          this.activeUnitId = null;
        }
        return;
      }
    }
  }

  private statesOfTarget(
    target: Extract<GameEvent, { type: "ApplyState" }>["target"],
  ): StateInstance[] | null {
    if (target.kind === "Unit") {
      return this.unitById(target.unitId)?.states ?? null;
    }
    return this.cellAt(target.coord.x, target.coord.y)?.states ?? null;
  }
}

import { describe, expect, it } from "vitest";
import {
  createTestSim,
  PLAYER_1,
  PLAYER_2,
  STANCE_A,
  STANCE_B,
  UNIT_1,
  UNIT_2,
  UNIT_3,
} from "./test-support/fixtures.js";

describe("turn engine (rulebook: Round Structure, Initiative)", () => {
  it("starts round 1 directly in unit turns when no stances are configured", () => {
    const sim = createTestSim();
    expect(sim.getEventLog()).toEqual([
      { type: "RoundStarted", roundNumber: 1 },
      { type: "TurnStarted", unitId: UNIT_1 },
    ]);
    expect(sim.getSnapshot().phase).toBe("UnitTurns");
  });

  it("alternates players and rotates the first player each round", () => {
    const sim = createTestSim();
    expect(sim.handleIntent(PLAYER_1, { type: "EndTurn", unitId: UNIT_1 }).accepted).toBe(true);
    expect(sim.handleIntent(PLAYER_2, { type: "EndTurn", unitId: UNIT_2 }).accepted).toBe(true);

    const log = sim.getEventLog();
    expect(log).toContainEqual({ type: "RoundStarted", roundNumber: 2 });
    // Round 2: player 2 activates first (rotation).
    const round2Start = log.findIndex(
      (event) => event.type === "RoundStarted" && event.roundNumber === 2,
    );
    expect(log[round2Start + 1]).toEqual({ type: "TurnStarted", unitId: UNIT_2 });
  });

  it("interleaves units: A, B, A's next has none, B's surplus acts last", () => {
    const sim = createTestSim({ extraPlayer2Unit: { x: 6, y: 3, z: 0 } });
    const snapshot = sim.getSnapshot();
    expect(snapshot.initiativeOrder).toEqual([UNIT_1, UNIT_2, UNIT_3]);
  });

  it("refreshes AP and MP at the start of each unit turn", () => {
    const sim = createTestSim();
    sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 2, y: 1, z: 0 }],
    });
    sim.handleIntent(PLAYER_1, { type: "EndTurn", unitId: UNIT_1 });
    sim.handleIntent(PLAYER_2, { type: "EndTurn", unitId: UNIT_2 });
    // Round 2, unit 2 first; end it to reach unit 1's refreshed turn.
    sim.handleIntent(PLAYER_2, { type: "EndTurn", unitId: UNIT_2 });
    const unit1 = sim.getSnapshot().units.find((unit) => unit.id === UNIT_1);
    expect(unit1?.currentMovementPoints).toBe(4);
    expect(unit1?.currentActionPoints).toBe(6);
  });

  it("rejects EndTurn from the wrong player", () => {
    const sim = createTestSim();
    const result = sim.handleIntent(PLAYER_2, { type: "EndTurn", unitId: UNIT_2 });
    expect(result).toMatchObject({ accepted: false, rejection: { code: "NotYourTurn" } });
  });
});

describe("secret stances (rulebook: Stances, Round Structure steps 3–6)", () => {
  it("starts in StanceSelection and blocks unit actions until reveal", () => {
    const sim = createTestSim({ withStances: true });
    expect(sim.getSnapshot().phase).toBe("StanceSelection");
    const move = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 2, y: 1, z: 0 }],
    });
    expect(move).toMatchObject({ accepted: false, rejection: { code: "NotYourTurn" } });
  });

  it("NEVER leaks a locked stance before the simultaneous reveal", () => {
    const sim = createTestSim({ withStances: true });
    const lock = sim.handleIntent(PLAYER_1, { type: "ChooseStance", stanceId: STANCE_A });
    expect(lock.accepted).toBe(true);
    if (lock.accepted) {
      // Locking is silent: no event of any kind is produced.
      expect(lock.events).toEqual([]);
    }
    // Nothing in the snapshot exposes the locked choice either.
    for (const unit of sim.getSnapshot().units) {
      expect(unit.revealedStanceId).toBeNull();
    }
    expect(JSON.stringify(sim.getSnapshot())).not.toContain(STANCE_A);
  });

  it("reveals simultaneously once every player has locked, then starts unit turns", () => {
    const sim = createTestSim({ withStances: true });
    sim.handleIntent(PLAYER_1, { type: "ChooseStance", stanceId: STANCE_A });
    const second = sim.handleIntent(PLAYER_2, { type: "ChooseStance", stanceId: STANCE_B });
    expect(second.accepted).toBe(true);
    if (second.accepted) {
      expect(second.events).toEqual([
        { type: "StanceRevealed", playerId: PLAYER_1, stanceId: STANCE_A },
        { type: "StanceRevealed", playerId: PLAYER_2, stanceId: STANCE_B },
        { type: "TurnStarted", unitId: UNIT_1 },
      ]);
    }
    const snapshot = sim.getSnapshot();
    expect(snapshot.phase).toBe("UnitTurns");
    expect(snapshot.units.find((unit) => unit.id === UNIT_1)?.revealedStanceId).toBe(STANCE_A);
    expect(snapshot.units.find((unit) => unit.id === UNIT_2)?.revealedStanceId).toBe(STANCE_B);
  });

  it("rejects double-locking (StanceAlreadyLocked) and unknown stances", () => {
    const sim = createTestSim({ withStances: true });
    sim.handleIntent(PLAYER_1, { type: "ChooseStance", stanceId: STANCE_A });
    expect(sim.handleIntent(PLAYER_1, { type: "ChooseStance", stanceId: STANCE_B })).toMatchObject({
      accepted: false,
      rejection: { code: "StanceAlreadyLocked" },
    });
    expect(
      sim.handleIntent(PLAYER_2, {
        type: "ChooseStance",
        stanceId: UNIT_1 as unknown as typeof STANCE_A,
      }),
    ).toMatchObject({ accepted: false, rejection: { code: "UnknownStance" } });
  });

  it("clears revealed stances when a new round begins", () => {
    const sim = createTestSim({ withStances: true });
    sim.handleIntent(PLAYER_1, { type: "ChooseStance", stanceId: STANCE_A });
    sim.handleIntent(PLAYER_2, { type: "ChooseStance", stanceId: STANCE_B });
    sim.handleIntent(PLAYER_1, { type: "EndTurn", unitId: UNIT_1 });
    sim.handleIntent(PLAYER_2, { type: "EndTurn", unitId: UNIT_2 });
    // Round 2 begins in stance selection again, with reveals cleared.
    const snapshot = sim.getSnapshot();
    expect(snapshot.phase).toBe("StanceSelection");
    expect(snapshot.roundNumber).toBe(2);
    for (const unit of snapshot.units) {
      expect(unit.revealedStanceId).toBeNull();
    }
  });
});

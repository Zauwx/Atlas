import { describe, expect, it } from "vitest";
import type { GameConfig, GameEvent, MatchSetup, PlayerId } from "@atlas/shared";
import {
  MapIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  StanceIdSchema,
  UnitIdSchema,
  TerrainIdSchema,
} from "@atlas/shared";
import { MatchCoordinator } from "./match-coordinator.js";
import { InMemoryReplayStore } from "../replay/replay-store.js";
import { ManualScheduler, RecordingMessenger } from "../test-support/test-doubles.js";
import {
  buildDevMatchSetup,
  createDevGameConfig,
  DEV_CLASS_ID,
  DEV_SPELL_GUST,
} from "../dev/dev-content.js";

const MATCH_ID = MatchIdSchema.parse("match-test");
const PLAYER_1 = PlayerIdSchema.parse("player-1");
const PLAYER_2 = PlayerIdSchema.parse("player-2");
const PLAYERS: readonly [PlayerId, PlayerId] = [PLAYER_1, PLAYER_2];
const UNIT_1 = UnitIdSchema.parse("player-1-unit-1");
const UNIT_2 = UnitIdSchema.parse("player-2-unit-1");
const STANCE_X = StanceIdSchema.parse("dev-stance-x");
const STANCE_Y = StanceIdSchema.parse("dev-stance-y");

interface Harness {
  coordinator: MatchCoordinator;
  messenger: RecordingMessenger;
  scheduler: ManualScheduler;
  replays: InMemoryReplayStore;
}

function createHarness(options?: {
  withStances?: boolean;
  setup?: MatchSetup;
  config?: GameConfig;
}): Harness {
  const baseConfig = options?.config ?? createDevGameConfig();
  const config: GameConfig =
    options?.withStances === true
      ? {
          ...baseConfig,
          stances: [
            { id: STANCE_X, name: "Dev Stance X", description: "Test-only." },
            { id: STANCE_Y, name: "Dev Stance Y", description: "Test-only." },
          ],
        }
      : baseConfig;
  const messenger = new RecordingMessenger();
  const scheduler = new ManualScheduler();
  const replays = new InMemoryReplayStore();
  const coordinator = new MatchCoordinator(
    MATCH_ID,
    config,
    options?.setup ?? buildDevMatchSetup(PLAYERS),
    messenger,
    scheduler,
    replays,
    { reconnectionGraceSeconds: 60 },
  );
  coordinator.start();
  return { coordinator, messenger, scheduler, replays };
}

function eventsIn(messenger: RecordingMessenger): GameEvent[] {
  return messenger.ofType("events").flatMap((message) => message.payload as GameEvent[]);
}

describe("MatchCoordinator: protocol", () => {
  it("broadcasts the config, then the initial snapshot, on start", () => {
    const { messenger } = createHarness();
    const snapshots = messenger.ofType("snapshot");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.kind).toBe("broadcast");
    const configIndex = messenger.messages.findIndex((message) => message.type === "config");
    const snapshotIndex = messenger.messages.findIndex((message) => message.type === "snapshot");
    expect(configIndex).toBeGreaterThanOrEqual(0);
    expect(configIndex).toBeLessThan(snapshotIndex);
  });

  it("acks accepted intents to the sender and broadcasts the event batch", () => {
    const { coordinator, messenger } = createHarness();
    messenger.clear();
    coordinator.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 3, y: 5, z: 0 }],
    });
    expect(messenger.ofType("ack")).toEqual([
      { kind: "direct", to: PLAYER_1, type: "ack", payload: { intentType: "Move" } },
    ]);
    expect(eventsIn(messenger)).toContainEqual({
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 3, y: 5, z: 0 }],
    });
  });

  it("rejects malformed payloads with SchemaInvalid, to the sender only", () => {
    const { coordinator, messenger } = createHarness();
    messenger.clear();
    coordinator.handleIntent(PLAYER_1, { type: "Teleport", to: "somewhere" });
    expect(messenger.messages).toEqual([
      {
        kind: "direct",
        to: PLAYER_1,
        type: "rejection",
        payload: { intentType: null, code: "SchemaInvalid", message: null },
      },
    ]);
  });

  it("relays engine rejections to the sender only", () => {
    const { coordinator, messenger } = createHarness();
    messenger.clear();
    coordinator.handleIntent(PLAYER_2, { type: "EndTurn", unitId: UNIT_2 });
    expect(messenger.messages).toEqual([
      {
        kind: "direct",
        to: PLAYER_2,
        type: "rejection",
        payload: { intentType: "EndTurn", code: "NotYourTurn", message: null },
      },
    ]);
  });
});

describe("MatchCoordinator: timers", () => {
  it("auto-ends the turn when the unit-turn timer expires", () => {
    const { messenger, scheduler } = createHarness();
    messenger.clear();
    scheduler.advance(45_000);
    const events = eventsIn(messenger);
    expect(events).toContainEqual({ type: "TurnEnded", unitId: UNIT_1 });
    expect(events).toContainEqual({ type: "TurnStarted", unitId: UNIT_2 });
  });

  it("does not reset the turn budget when the player acts", () => {
    const { coordinator, messenger, scheduler } = createHarness();
    scheduler.advance(40_000);
    coordinator.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 3, y: 5, z: 0 }],
    });
    messenger.clear();
    // Only 5s of the original 45s budget remain, action or not.
    scheduler.advance(5_000);
    expect(eventsIn(messenger)).toContainEqual({ type: "TurnEnded", unitId: UNIT_1 });
  });

  it("auto-locks the first configured stance for silent players on stance timeout", () => {
    const { messenger, scheduler } = createHarness({ withStances: true });
    messenger.clear();
    scheduler.advance(30_000);
    const events = eventsIn(messenger);
    expect(events).toContainEqual({
      type: "StanceRevealed",
      playerId: PLAYER_1,
      stanceId: STANCE_X,
    });
    expect(events).toContainEqual({
      type: "StanceRevealed",
      playerId: PLAYER_2,
      stanceId: STANCE_X,
    });
    expect(events.some((event) => event.type === "TurnStarted")).toBe(true);
  });

  it("repeats each player's previous stance on later timeouts", () => {
    const { coordinator, messenger, scheduler } = createHarness({ withStances: true });
    coordinator.handleIntent(PLAYER_1, { type: "ChooseStance", stanceId: STANCE_Y });
    coordinator.handleIntent(PLAYER_2, { type: "ChooseStance", stanceId: STANCE_X });
    coordinator.handleIntent(PLAYER_1, { type: "EndTurn", unitId: UNIT_1 });
    coordinator.handleIntent(PLAYER_2, { type: "EndTurn", unitId: UNIT_2 });
    // Round 2 stance selection: nobody locks; timeout repeats round-1 picks.
    messenger.clear();
    scheduler.advance(30_000);
    const events = eventsIn(messenger);
    expect(events).toContainEqual({
      type: "StanceRevealed",
      playerId: PLAYER_1,
      stanceId: STANCE_Y,
    });
    expect(events).toContainEqual({
      type: "StanceRevealed",
      playerId: PLAYER_2,
      stanceId: STANCE_X,
    });
  });
});

describe("MatchCoordinator: disconnects and match end", () => {
  it("notifies, waits out the grace period, then declares a forfeit", () => {
    const { coordinator, messenger, scheduler, replays } = createHarness();
    messenger.clear();
    coordinator.playerDisconnected(PLAYER_2);
    expect(messenger.ofType("playerConnection")).toEqual([
      {
        kind: "broadcast",
        to: null,
        type: "playerConnection",
        payload: { playerId: PLAYER_2, connected: false },
      },
    ]);
    scheduler.advance(60_000);
    expect(messenger.ofType("matchEnded")).toEqual([
      {
        kind: "broadcast",
        to: null,
        type: "matchEnded",
        payload: { reason: "Forfeit", winnerPlayerId: PLAYER_1 },
      },
    ]);
    expect(coordinator.ended).toBe(true);
    expect(replays.get(MATCH_ID)?.ended.reason).toBe("Forfeit");
  });

  it("cancels the forfeit and resyncs the player on reconnection", () => {
    const { coordinator, messenger, scheduler } = createHarness();
    coordinator.playerDisconnected(PLAYER_2);
    scheduler.advance(30_000);
    messenger.clear();
    coordinator.playerReconnected(PLAYER_2);
    expect(messenger.ofType("playerConnection")).toEqual([
      {
        kind: "broadcast",
        to: null,
        type: "playerConnection",
        payload: { playerId: PLAYER_2, connected: true },
      },
    ]);
    expect(messenger.ofType("snapshot").filter((message) => message.to === PLAYER_2)).toHaveLength(
      1,
    );
    scheduler.advance(120_000);
    // No forfeit fires; the match continues (turn timeouts may fire instead).
    expect(messenger.ofType("matchEnded")).toEqual([]);
    expect(coordinator.ended).toBe(false);
  });

  it("ends the match with Victory and saves the replay when the engine declares a winner", () => {
    // Custom setup: unit-2 stands between unit-1 and a void pit, one gust away.
    const voidId = TerrainIdSchema.parse("void");
    const normalId = TerrainIdSchema.parse("normal");
    const cells = Array.from({ length: 25 }, (_, index) => ({
      z: 0,
      terrainId: index === 12 ? voidId : normalId, // (2,2) is void
    }));
    const setup: MatchSetup = {
      map: { id: MapIdSchema.parse("map-void"), name: "Void Test", width: 5, height: 5, cells },
      players: [
        {
          id: PLAYER_1,
          units: [{ id: UNIT_1, classId: DEV_CLASS_ID, position: { x: 0, y: 2, z: 0 } }],
        },
        {
          id: PLAYER_2,
          units: [{ id: UNIT_2, classId: DEV_CLASS_ID, position: { x: 1, y: 2, z: 0 } }],
        },
      ],
    };
    const { coordinator, messenger, replays } = createHarness({ setup });
    messenger.clear();
    coordinator.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: DEV_SPELL_GUST,
      target: { x: 1, y: 2, z: 0 },
    });
    expect(eventsIn(messenger)).toContainEqual({ type: "Victory", winnerPlayerId: PLAYER_1 });
    expect(messenger.ofType("matchEnded")).toEqual([
      {
        kind: "broadcast",
        to: null,
        type: "matchEnded",
        payload: { reason: "Victory", winnerPlayerId: PLAYER_1 },
      },
    ]);
    const replay = replays.get(MATCH_ID);
    expect(replay?.ended).toEqual({ reason: "Victory", winnerPlayerId: PLAYER_1 });
    expect(replay?.events.at(-1)).toEqual({ type: "Victory", winnerPlayerId: PLAYER_1 });
    // Post-match intents are refused.
    messenger.clear();
    coordinator.handleIntent(PLAYER_2, { type: "EndTurn", unitId: UNIT_2 });
    expect(messenger.messages[0]?.type).toBe("rejection");
  });
});

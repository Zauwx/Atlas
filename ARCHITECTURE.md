# ARCHITECTURE.md — Technical Architecture

Project codename: **Atlas**

This document defines the technical architecture of Atlas: the monorepo structure, the responsibilities of each package, the networking model, the gameplay engine modules, and the delivery roadmap.

For gameplay rules, [COMBAT_RULEBOOK.md](COMBAT_RULEBOOK.md) is authoritative. For process and conventions, see [CLAUDE.md](CLAUDE.md).

---

## Architectural Goals

Every technical decision must prioritize:

- long-term maintainability
- modularity
- deterministic gameplay
- server authority
- extensibility
- readability
- performance
- testability

---

## Tech Stack

| Layer    | Technology                                                                   |
| -------- | ---------------------------------------------------------------------------- |
| Monorepo | npm workspaces                                                               |
| Server   | Node.js, TypeScript, Colyseus                                                |
| Client   | Phaser 3, Vite, TypeScript                                                   |
| Shared   | TypeScript (types, DTOs, enums, schemas, configuration, deterministic rules) |
| Testing  | Vitest (single root runner for all packages)                                 |
| CI       | GitHub Actions (format check → lint → build → test)                          |

---

## Monorepo Structure

```
packages/
  client/   # Rendering, input, animations, UI, client-side prediction
  server/   # Colyseus rooms, networking, validation, authoritative simulation
  shared/   # Types, DTOs, enums, schemas, game configuration, deterministic rule data
```

### Dependency Direction

```
client ──▶ shared ◀── server
```

- `client` and `server` both depend on `shared`.
- `client` and `server` **never** import from each other.
- `shared` depends on nothing else in the workspace.
- No circular dependencies anywhere, at package level or module level.

### Package Responsibilities

**`shared`**

- Type definitions and DTOs for every message exchanged between client and server.
- Enums: terrain types, elements, states, stances, event types, error codes.
- Schemas for validating intents and configuration files.
- Game configuration: classes, spells, terrain, elements, status effects, stances, physics constants.
- Deterministic rule data used identically by simulation and (later) client prediction.
- **No gameplay execution logic in Phase 2.** The gameplay engine itself is a Phase 3 deliverable (its home package is an Open Question below).

**`server`**

- Colyseus rooms: matchmaking entry point, match lifecycle, player sessions.
- Intent validation: every client message is validated against schema, game state, and rules before it touches the simulation.
- The authoritative simulation: the only place where gameplay is resolved.
- Event emission: ordered gameplay events broadcast to clients.
- Replay foundations: the persisted event log of a match.
- Secret stance storage: stance choices are held server-side and excluded from state synchronization until reveal.

**`client`**

- Phaser 3 rendering of the board, units, terrain, and effects.
- Input capture and conversion into **intents** (never into outcomes).
- Playback of server events as animations.
- UI: HUD, stance selection, spell bar, timers.
- Optional client-side prediction (Phase 5) — always reconciled against server events, never trusted.

---

## Networking Model

The simulation always runs on the server. The client is a renderer and an intent emitter.

```
Client                        Server
  │                              │
  │  Intent (move, cast, stance) │
  ├─────────────────────────────▶│
  │                              │ 1. Validate intent (schema, turn, rules)
  │                              │ 2. Resolve deterministically (rulebook pipeline)
  │                              │ 3. Append events to the match event log
  │   Ordered event stream       │
  │◀─────────────────────────────┤
  │                              │
  │  Play back events            │
  │  (animations, UI updates)    │
```

Principles:

- **Intents in, events out.** The client never sends a result; the server never trusts a client value.
- Invalid intents are rejected with an explicit error code; nothing is silently corrected.
- Events are emitted in resolution order and carry everything the client needs to render the outcome.
- The event vocabulary is defined in COMBAT_RULEBOOK.md (Move, Push, Collision, Fall, Damage, Heal, ApplyState, RemoveState, TerrainChanged, Death, Victory).
- The client never invents an event.

### Secret Stance Handling

Stance choices are the signature mechanic and receive special networking treatment:

- Stance intents are stored in server memory, **outside** any synchronized state schema.
- No stance information reaches any client — including the owning client's opponent — before the simultaneous reveal step.
- Reveal is an explicit server event, emitted to all players at the same simulation step.

### Replay Foundations

- A match replay is the initial match configuration plus the ordered event log.
- Because the engine is deterministic, replaying the log reproduces the match exactly.
- The event log is the same data used for live clients, spectator mode (future), and debugging.

---

## Gameplay Engine Modules (Phase 3)

The gameplay engine is a set of **pure, render-free, I/O-free TypeScript modules**. Each module implements a section of the rulebook and is unit-tested against it.

| Module             | Responsibility                                                   |
| ------------------ | ---------------------------------------------------------------- |
| `board`            | Grid, cells, coordinates (x, y, z), occupancy invariants         |
| `movement`         | Movement validation, MP costs, vertical costs                    |
| `pathfinding`      | Deterministic reachable-cell and path computation                |
| `line-of-sight`    | Server-side LoS resolution                                       |
| `push`             | Forced movement, cell-by-cell traversal                          |
| `collision`        | Push interruption and collision damage                           |
| `fall`             | Fall detection, landing, fall damage                             |
| `terrain`          | Terrain types, terrain→state application, terrain transformation |
| `elements`         | Element carriage on damage, elemental interactions, propagation  |
| `states`           | Status effect lifecycle: duration, owner, source, effects        |
| `stances`          | Stance rule modifiers, secret selection, reveal                  |
| `turn-engine`      | Round/turn structure, initiative order, resource refresh         |
| `spell-resolution` | The 20-step resolution pipeline (rulebook-defined order)         |
| `victory`          | Victory condition checks                                         |
| `events`           | Event log construction                                           |

Module rules:

- Modules communicate through explicit interfaces; no module reaches into another's internals.
- The resolution pipeline order is owned by COMBAT_RULEBOOK.md; code follows the document, never the reverse.
- Rule priority (Global → Stance → Terrain → States → Spell → Temporary effects) is implemented as a single, explicit resolution mechanism — never as scattered `if` statements inside spells.
- All randomness-free; if a mechanic ever explicitly introduces randomness, it must use a seeded, replayable RNG owned by the simulation.

---

## Data-Driven Configuration

- Classes, spells, terrain, elements, status effects, and stances are defined in configuration files in `shared`.
- The engine interprets configuration; it does not special-case content.
- Adding content (a new spell, terrain, or stance) must not require modifying engine modules — only configuration and, where a genuinely new rule is introduced, a rulebook update plus a focused rule implementation.
- Physics constants (collision damage per cell, fall damage per height level, climb costs) live in configuration, not in code literals.

---

## Roadmap

| Phase | Deliverable                                                                                                                                                                         | Status           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 0     | Documentation (CLAUDE.md, ARCHITECTURE.md, GAME_DESIGN.md, COMBAT_RULEBOOK.md, BALANCE_GUIDELINES.md)                                                                               | Done             |
| 1     | Repository setup: monorepo, tooling, linting, formatting, CI, testing                                                                                                               | Done             |
| 2     | Shared package: DTOs, enums, types, schemas, configurations (no gameplay)                                                                                                           | Pending approval |
| 3     | Gameplay engine: movement, pathfinding, LoS, push, collision, fall, terrain, elements, status effects, stances, turn engine, spell resolution, victory conditions — with unit tests | —                |
| 4     | Server: Colyseus, rooms, networking, validation, synchronization, replay foundations                                                                                                | —                |
| 5     | Client: Phaser, rendering, input, animations, UI, prediction                                                                                                                        | —                |
| 6     | Prototype V1: one map, 1v1, two classes, basic terrain, Water + Wet, three stances, minimal UI, playable match                                                                      | —                |

Each phase ends with a summary, open questions, and an explicit stop for approval.

---

## Open Questions

- **Gameplay engine package location (Phase 3):** should the pure engine live inside `packages/server`, inside `packages/shared`, or in a dedicated `packages/engine`? A dedicated package keeps `shared` free of logic and lets a future client-side prediction reuse the exact simulation code. Decision needed before Phase 3.
- **State synchronization strategy:** use Colyseus `Schema` for continuous state sync, or rely purely on the ordered event stream with a full-state snapshot on join/reconnect? (Event-stream-first fits determinism and replays; Colyseus Schema fits the framework's tooling.) Decision needed before Phase 4.
- **Turn timer enforcement:** timer values and what happens on timeout (auto-pass? default stance?) — gameplay decision needed before Phase 4.
- **Reconnection policy:** how long a disconnected player's session is held, and what opponents see. Decision needed before Phase 4.
- **Client prediction scope (Phase 5):** whether V1 ships with any prediction at all, or pure event playback. Pure playback is simpler and always correct; prediction improves feel.

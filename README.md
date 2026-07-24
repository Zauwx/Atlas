# Atlas

**Atlas** (working title) is an open-source, competitive, browser-based Tactical RPG.

Its identity is built on three gameplay pillars:

1. **Verticality** — height is a weapon: movement, vision, pushes, and falls all depend on it.
2. **Living Terrain** — terrain is an actor in the fight, never decoration.
3. **Secret Stances** — every round, players secretly pick a stance that changes how the engine resolves their actions. Bluff, anticipation, counter-play.

The game is fully **server-authoritative** and **deterministic**: the client sends intentions, the server resolves everything, and the same inputs always produce the same result.

---

## Documentation

Atlas is a **documentation-first** project. Read before coding:

| Document                                       | Purpose                                              |
| ---------------------------------------------- | ---------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                         | Repository standards, conventions, workflow          |
| [ARCHITECTURE.md](ARCHITECTURE.md)             | Technical architecture, networking, modules, roadmap |
| [GAME_DESIGN.md](GAME_DESIGN.md)               | Vision, gameplay philosophy, core systems            |
| [COMBAT_RULEBOOK.md](COMBAT_RULEBOOK.md)       | **Authoritative** combat rules and invariants        |
| [BALANCE_GUIDELINES.md](BALANCE_GUIDELINES.md) | Balancing philosophy and content creation rules      |

## Repository Layout

npm-workspaces monorepo:

```
packages/
  client/   # Phaser 3 + Vite — rendering, input, UI (frameworks arrive in Phase 5)
  server/   # Node.js + Colyseus — authoritative simulation (frameworks arrive in Phase 4)
  shared/   # Types, DTOs, enums, schemas, game configuration
```

Dependency direction: `client → shared ← server`. Client and server never import each other.

## Getting Started

Requires Node.js ≥ 20.

```bash
npm ci            # install dependencies
npm run build     # typecheck and build all packages
npm run lint      # ESLint (type-checked, cycle detection)
npm run format    # Prettier
npm test          # Vitest
```

To play a local match (two browser tabs join automatically):

```bash
npm run dev:server
```

```bash
npm run dev:client
```

Then open http://localhost:5173 in two tabs — the first two clients are matched
automatically into a game of **Ridge and Pools**: Vanguard (west) versus
Tidecaller (east).

## Project Status

Development is phase-gated (see [ARCHITECTURE.md](ARCHITECTURE.md#roadmap)):

- [x] Phase 0 — Documentation
- [x] Phase 1 — Repository setup (monorepo, tooling, linting, CI, testing)
- [x] Phase 2 — Shared package (DTOs, enums, types, schemas, configurations)
- [x] Phase 3 — Gameplay engine (deterministic, fully unit-tested)
- [x] Phase 4 — Server (Colyseus rooms, validation, synchronization, replays)
- [x] Phase 5 — Client (Phaser rendering, input, UI)
- [x] Phase 6 — Prototype V1 (playable 1v1 match)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: everything in English, documentation before code, and [COMBAT_RULEBOOK.md](COMBAT_RULEBOOK.md) is the law for gameplay.

## License

[AGPL-3.0-only](LICENSE). You are free to use, modify, and self-host Atlas — but if you host a modified version, you must publish your source code.

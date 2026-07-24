# CLAUDE.md — Repository Standards & Development Contract

Project codename: **Atlas**

Atlas is an open-source competitive browser Tactical RPG built around three gameplay pillars:

1. **Verticality**
2. **Living Terrain**
3. **Secret Stances**

This file defines the rules that every contributor — human or AI — must follow when working in this repository.

---

## Document Authority

The project is **documentation-first**. Documentation is written and approved before implementation.

| Document                                       | Scope                                                          | Authority                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [COMBAT_RULEBOOK.md](COMBAT_RULEBOOK.md)       | Official combat rules, resolution order, invariants            | **Authoritative for all gameplay mechanics.** In case of conflict, this document wins. |
| [GAME_DESIGN.md](GAME_DESIGN.md)               | Vision, gameplay philosophy, core systems, player experience   | Authoritative for design intent                                                        |
| [ARCHITECTURE.md](ARCHITECTURE.md)             | Technical architecture, networking, modules, monorepo, roadmap | Authoritative for technical structure                                                  |
| [BALANCE_GUIDELINES.md](BALANCE_GUIDELINES.md) | Balancing philosophy, methodology, content creation rules      | Authoritative for balancing work                                                       |
| CLAUDE.md (this file)                          | Repository standards, conventions, workflow                    | Authoritative for process                                                              |

Any new mechanic must be added to COMBAT_RULEBOOK.md **before** it is implemented.

---

## Language Rule

**Everything is written in English.** No exceptions, no mixed languages.

This applies to: documentation, comments, markdown, commit messages, folder names, variable names, class names, pull request descriptions, issues, and TODOs.

---

## Phase-Gated Roadmap

Development follows the phased roadmap defined in [ARCHITECTURE.md](ARCHITECTURE.md).

- Never skip a phase.
- Never generate code for a future phase.
- Every phase ends with a summary, a list of open questions, and an explicit stop for approval.
- Work on the next phase begins only after explicit approval.

---

## Open Questions Protocol

Missing rules are **never** invented or silently assumed.

When information is missing:

1. Add the question to the **Open Questions** section of the relevant document.
2. Continue working only on what is fully specified.
3. Wait for a decision before implementing anything that depends on the answer.

---

## Architecture Rules

These rules are absolute. A change that violates one of them must be rejected and redesigned.

### Server Authority

- The server is authoritative for **everything**: movement, damage, line of sight, collisions, pushes, falls, status effects, terrain interactions, and victory.
- The client sends **intentions only**. The server validates every intention.
- The client renders server-emitted events. It never decides gameplay outcomes.
- Secret stances are locked server-side and are **never synchronized before reveal**.

### Determinism

- The same inputs always produce the same outputs.
- No gameplay logic depends on rendering, framerate, network arrival order, or display order.
- All iteration orders in gameplay code must be explicit and stable.

### Code Quality

- **Strict TypeScript.** `strict: true`, no `any`, no implicit escapes from the type system.
- **No circular dependencies** between modules or packages.
- **Single Responsibility Principle** — small, focused modules.
- **Composition over inheritance.**
- **Dependency inversion** — gameplay logic depends on abstractions, not on Colyseus, Phaser, or any I/O.
- **No God Objects.**
- Gameplay logic is **pure** and completely separated from rendering and networking.
- Prefer explicit code over clever code. Assume hundreds of future contributors.

### Data-Driven Design

- Classes, spells, terrain, elements, status effects, and stances are all defined by **configuration**, not by code branches.
- Never hardcode a balance value when configuration is possible.
- Configuration lives in the `shared` package so both server and client read the same source of truth.

---

## Monorepo Layout

The repository is an npm-workspaces monorepo (set up in Phase 1):

```
packages/
  client/   # Phaser 3 + Vite + TypeScript — rendering, input, UI only
  server/   # Node.js + TypeScript + Colyseus — rooms, validation, simulation
  shared/   # Types, DTOs, enums, schemas, game configuration, deterministic rules
```

Dependency direction: `client → shared ← server`. The client and server never import from each other.

---

## Conventions

### Naming

- Files and folders: `kebab-case` for folders, `PascalCase` for files exporting a single class/type, `camelCase` for utility modules.
- Types, classes, interfaces, enums: `PascalCase`.
- Enum members and constants: `SCREAMING_SNAKE_CASE` for true constants, `PascalCase` for enum members.
- Variables and functions: `camelCase`.
- No abbreviations that hide meaning. `movementPoints`, not `mp`, in code identifiers (docs may use the abbreviations AP/MP after defining them).

### Comments and Documentation

- Comments explain **why**, not what.
- Every gameplay module documents which rulebook section it implements.
- Important decisions are recorded in the relevant markdown document, not in chat history.

### Commits and Pull Requests

- Commit messages in English, imperative mood: `Add fall damage resolution step`.
- One logical change per commit.
- Pull request descriptions state which document(s) authorize the change.
- A PR that changes gameplay behavior without a corresponding COMBAT_RULEBOOK.md update must be rejected.

### Testing

- Gameplay engine code (Phase 3+) requires unit tests.
- Tests assert deterministic outcomes: same inputs, same outputs.
- Rendering code is excluded from gameplay test requirements but must not contain gameplay logic.

---

## Guardian Rule

Every contributor is responsible for the long-term quality of this project.

If a requested change would damage architecture, maintainability, or determinism:

1. Explain why.
2. Propose a better solution.
3. Wait for validation instead of implementing it.

---

## Open Questions

- License choice for the open-source release (MIT, Apache-2.0, AGPL…?).
- Contribution workflow details (branch naming, review requirements, CODEOWNERS) — to be defined in Phase 1.
- Versioning scheme for documents vs. packages (single project version or per-package?).

# GAME_DESIGN.md — Vision & Core Systems

Project codename: **Atlas** (working title)

> A competitive PvP Tactical RPG built on verticality, physical interactions, and secret stances.

This document defines the design vision and the player-facing systems. For exact rules and resolution order, [COMBAT_RULEBOOK.md](COMBAT_RULEBOOK.md) is authoritative.

---

## Vision

Our goal is a modern PvP Tactical RPG where positioning, reading the opponent, and intelligent use of the terrain matter more than stat accumulation.

The game must be:

- competitive
- readable
- deep
- easy to understand, hard to master
- fully deterministic

Every victory must feel like the result of the player's decisions — never of luck.

---

## The Three Gameplay Pillars

Everything in the game exists to reinforce three fundamental mechanics.

### 1. Verticality

Height influences:

- movement
- lines of sight
- the range of certain effects
- pushes
- collisions
- fall damage

The map is a weapon. The relief matters as much as the characters.

### 2. Living Terrain

Terrain is never decorative. Every cell can influence the fight.

Terrain can:

- protect
- slow
- amplify certain elements
- apply states
- be transformed

The player must constantly account for the environment.

### 3. Secret Stances

Stances are the signature mechanic.

At the start of every round, each player **secretly** selects a stance. Choices are locked server-side and revealed simultaneously. A stance changes how a character fights — it modifies the rules of the engine, not just numbers.

Stances influence:

- movement
- reactions
- pushes
- collisions
- terrain interactions
- certain spell effects

The goal is to create:

- bluffing
- anticipation
- counter-play

Two players playing the same class can have completely different styles.

---

## Combat Philosophy

Fights must be:

- quick to understand
- tactically rich
- free of dead time

Every turn must offer several interesting choices. The player must never have a single obvious action.

---

## Match Structure

Atlas is played in **rounds**. Each round:

1. Round start — round counter increments, start-of-round effects trigger.
2. **Secret stance selection** — all players choose simultaneously; choices are locked server-side.
3. **Simultaneous reveal** — stances are revealed and their rule modifiers take effect.
4. **Alternating unit turns** — units act one at a time in initiative order. On its turn, a unit spends its resources to move and cast spells.
5. Round end — end-of-round state effects trigger (durations tick, damage-over-time resolves), then the next round begins.

### Resources

Each unit refreshes two resources at the start of its turn:

- **AP (Action Points)** — spent to cast spells.
- **MP (Movement Points)** — spent to move.

This separation keeps trade-offs readable: mobility and offense compete only where a mechanic explicitly makes them (spells that grant movement, stances that convert one into the other, terrain that taxes MP).

---

## The Board

- The board is a **square grid**.
- Movement is **orthogonal** (4 directions). No diagonal movement.
- Distances and ranges use **Manhattan distance**.
- Every cell has coordinates **x, y, z**.

### Verticality

Each cell has a height **z from 0 to 5**.

- Climbing +1 z costs **+1 MP** (in addition to the normal movement cost).
- Climbing +2 z or more in a single step is **impossible** without a dedicated ability.
- Descending is free.

Height influences:

- vision
- mobility
- fall damage
- certain abilities

---

## Physics

The physics of forced movement is a core part of gameplay, not a visual flourish.

Forced movement can cause:

- pushes
- collisions
- falls

Damage from physics must be simple and predictable. The player must be able to anticipate the exact consequences of an action before committing to it. (Exact formulas live in the rulebook: collision and fall damage are fixed, readable numbers.)

---

## Terrain

Every cell has a terrain type. Examples:

- Normal
- Water
- Ice
- Vegetation
- Earth
- Lava
- Void

Terrain applies its effects **through states — never directly**. Water does not do anything by itself; standing in Water applies **Wet**, and Wet defines the consequences. This keeps every terrain interaction uniform, configurable, and extensible.

---

## Elements

Elements exist to enrich the terrain game. They must **not** become a complex resistance system.

Elements:

- Physical
- Fire
- Water
- Ice
- Lightning
- Earth
- Air
- Neutral

Elemental interactions flow through:

- states
- terrain
- rules

Never through conditions hardcoded into individual spells.

---

## States

States represent the temporary consequences of an effect. Examples:

- Wet
- Burning
- Frozen
- Electrified
- Shielded
- Rooted

Every state has:

- a duration
- effects
- interactions with other states, elements, and terrain

States modify how the engine resolves rules — they are not mere stat modifiers.

---

## Classes

Each class must offer a different way of using the three pillars.

Classes are never defined by their damage alone. Every class must have:

- an identity
- a unique mechanic
- strengths
- weaknesses

---

## Spells

Spells are tools. Their main purposes:

- manipulate terrain
- reposition units
- exploit stances
- create opportunities

The game must not become a contest of big numbers.

---

## Stances

Stances are chosen secretly each round. Their purpose is **not** to grant passive bonuses — they change how the engine resolves certain actions.

A stance can:

- improve mobility
- modify pushes
- change interactions with the relief
- influence collisions
- modify certain spells

The architecture must make adding new stances easy.

---

## Maps

Maps must encourage:

- meaningful movement choices
- taking high ground
- line-of-sight play
- natural traps

A map is an actor in the fight, not a backdrop.

---

## Balancing Philosophy

The game favors **decisions over statistics**.

Differences between players must come primarily from:

- positioning
- stances
- use of terrain

See [BALANCE_GUIDELINES.md](BALANCE_GUIDELINES.md) for methodology.

---

## Design Principles

- The player must always understand why they won or lost.
- Important information must be visible.
- Rules must stay coherent.
- Every mechanic must interact with several other mechanics. Avoid isolated systems.

---

## What This Game Is NOT

This game is not:

- an MMORPG
- an idle game
- a hero shooter
- an auto battler

It is a PvP Tactical RPG. The heart of the experience is tactical thinking.

---

## Long-Term Vision

After Prototype V1, the engine must allow adding — without any engine rework:

- new classes
- new terrains
- new elements
- new stances
- new game modes
- dynamic maps
- ranked matchmaking
- spectator mode
- replays
- tournaments
- a map editor

---

## Open Questions

- **Team sizes beyond 1v1:** the prototype is 1v1; are 2v2+ modes part of the design horizon, and do they change stance selection (per player or per unit)?
- **Units per player:** one unit per player, or squads? (The prototype implies one; the rulebook is written to support either.)
- **Turn timers:** time budget per stance selection and per unit turn.
- **Baseline resource values:** starting HP, AP, MP per class — a balancing decision, tracked in BALANCE_GUIDELINES.md.
- **Vision/fog of war:** does higher ground extend vision range, and is there hidden information on the board besides stances?

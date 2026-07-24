# COMBAT_RULEBOOK.md — Official Combat Rules

Project codename: **Atlas**

**Version: 0.1 (Prototype V1)**

This document defines the official rules of the combat engine.

**In case of conflict with any other document, COMBAT_RULEBOOK.md is authoritative for all gameplay mechanics.**

Any new mechanic must add or modify a rule in this document **before** it is implemented.

---

## Philosophy

The combat engine is:

- deterministic
- predictable
- fully server-side
- independent of rendering

Randomness never takes part in action resolution, unless a mechanic explicitly introduces it (and then only through a seeded, replayable source owned by the simulation).

Two matches replayed with the same inputs must produce exactly the same result.

---

## Core Concepts

A match is composed of:

- players
- units
- cells
- effects
- states
- events

Occupancy rules:

- A unit occupies exactly one cell.
- A cell contains at most one unit.

---

## Board & Coordinates

- The board is a **square grid**.
- Every cell has coordinates **x, y, z**.
- **z ranges from 0 to 5.**
- Adjacency is **orthogonal**: each cell has up to 4 neighbors. There is no diagonal adjacency.
- All distances and spell ranges use **Manhattan distance** on (x, y).

---

## Terrain

Every cell has:

- one terrain type
- zero or more temporary states

Terrain can influence:

- movement
- damage
- effects
- applied states

Terrain applies its effects **only via states**, never directly.

Example:

```
Water (terrain) → applies Wet (state)
```

All consequences are then defined by **Wet**, not by Water.

Terrain types (initial set): Normal, Water, Ice, Vegetation, Earth, Lava, Void.

---

## Round Structure

A match is a sequence of **rounds**. Each round proceeds in this exact order:

1. Round counter increments.
2. Start-of-round effects trigger.
3. All players **secretly** choose a stance, simultaneously.
4. The server **locks** the choices.
5. **Simultaneous reveal** of all stances.
6. Stance rule modifiers are computed and take effect for the round.
7. Units act in **alternating turns**, one unit at a time, in initiative order.
8. When every unit has acted, end-of-round effects trigger (state durations tick and expire, periodic effects resolve).
9. Next round begins.

### Unit Turns

- On its turn, a unit refreshes its **AP (Action Points)** and **MP (Movement Points)**.
- AP is spent to cast spells. MP is spent to move.
- A unit may freely interleave movement and spell casts within its turn, resource limits permitting.
- A unit's turn ends when the player ends it or when its turn timer expires.

---

## Movement

Every movement is validated by the server. The server checks:

- map boundaries
- cell occupancy
- MP cost
- height differences
- states preventing movement

Movement is performed cell by cell along an orthogonal path.

---

## Verticality

- Climbing **+1 z**: costs **+1 MP** in addition to the normal cost of entering the cell.
- Climbing **+2 z or more** in one step: **forbidden**, unless an ability explicitly allows it.
- Descending: **free** (no additional MP cost). Descents larger than the safe threshold are resolved by the fall rules.
- **Forced movement ignores MP costs.**

---

## Line of Sight

The server computes line of sight. The computation takes into account:

- the relief (z differences)
- obstacles
- units, where a rule says they block

No line-of-sight computation is ever performed client-side for gameplay purposes.

---

## Spells

Every spell follows exactly the same pipeline. No spell can bypass it.

---

## Resolution Pipeline

Every action resolves in this exact order:

1. Validation
2. Cost payment
3. Target selection
4. Stance modifier computation
5. Terrain modifier computation
6. Voluntary movement application
7. Forced movement application
8. Pushes
9. Collisions
10. Falls
11. Direct damage computation
12. Elemental damage computation
13. State application
14. Terrain transformation (if any)
15. Elemental interaction propagation
16. Deferred effect triggering
17. Death check
18. Removal of eliminated units
19. Victory condition check
20. Network event creation

**This order cannot be changed without updating this document.**

---

## Pushes

A push moves a unit cell by cell.

- Each traversed cell is validated individually by the server.
- A push can cause: a collision, a fall, or entry onto a terrain (which applies its states).

---

## Collisions

A collision occurs when a push is interrupted (by a unit, an obstacle, or an impassable height difference).

- Each remaining cell of push distance inflicts **10 HP**.
- Collisions are resolved **before** falls.

---

## Falls

A fall begins when no cell supports the unit.

- The fall stops at the first valid ground below.
- Damage: **(z_start − z_end) × 15 HP**.
- Fall damage is computed exactly once per fall.

---

## States

Every state has:

- a duration
- an owner
- a source
- effects

States never modify statistics directly. They modify the **rules of the engine**.

Initial state examples: Wet, Burning, Frozen, Electrified, Shielded, Rooted.

---

## Elements

Element types: Physical, Fire, Water, Ice, Lightning, Earth, Air, Neutral.

- Elements are carried by damage.
- Terrain reacts to elements.
- States react to elements.
- Elemental interactions are **never** implemented as per-spell hardcoded conditions.

---

## Propagation

An elemental or terrain propagation:

- can never be infinite
- processes each cell **at most once**
- follows a deterministic order

---

## Stances

- Stances are chosen **secretly** each round and locked server-side.
- Stance choices are **never synchronized to any client before the reveal step**.
- A stance is a set of rules, not a stat bonus.

A stance can:

- modify a movement
- modify a push
- modify a collision
- modify a fall
- modify certain spell resolutions

---

## Rule Priority

When multiple rule sources apply to the same resolution, priority is:

```
Global rules
   ↓
Stance
   ↓
Terrain
   ↓
States
   ↓
Spell
   ↓
Temporary effects
```

A lower level cannot override a higher level unless the higher level explicitly allows it.

---

## Death

A unit dies when **HP ≤ 0**.

Death is checked **after the complete resolution of an action** — never in the middle of one.

---

## Victory

Victory conditions are checked **after** eliminated units are removed (pipeline steps 18 → 19).

The engine never checks victory during a resolution.

---

## Determinism

All operations must be:

- predictable
- replayable
- identical on every platform

No computation may depend on:

- framerate
- the client
- network arrival order
- display order

All iteration orders over collections in gameplay code must be explicit and stable.

---

## Event Journal

Every action produces events.

Combat event vocabulary:

- Move
- Push
- Collision
- Fall
- Damage
- Heal
- ApplyState
- RemoveState
- TerrainChanged
- Death
- Victory

Flow event vocabulary (match structure, no combat resolution of their own):

- RoundStarted — a new round begins (carries the round number).
- StanceRevealed — the simultaneous stance reveal (see Round Structure, step 5). Emitted to all players at the same simulation step; this is the only way stance information ever reaches a client.
- TurnStarted — a unit's turn begins.
- TurnEnded — a unit's turn ends.

These events serve:

- the client (rendering and animations)
- replays
- spectator mode
- debugging

Events reflect only actions already validated and resolved by the server. **The client never invents an event.**

---

## Edge Cases

Every ambiguous rule must be documented in this section. No implicit decision is allowed.

_(No edge cases recorded yet. Candidates awaiting decisions are listed under Open Questions.)_

---

## Invariants

The following invariants must never be violated:

- A unit occupies exactly one cell.
- A cell contains at most one unit.
- The server is always authoritative.
- Secret stances are never synchronized before their reveal.
- The engine is fully deterministic.
- Network events reflect only actions already validated by the server.
- Terrain influences combat via states or rules — never via ad-hoc handling inside spells.
- Every new mechanic integrates into the resolution pipeline without bypassing it.

---

## Open Questions

- **Initiative order:** how is the acting order of units determined each round (fixed stat, alternating by player, stance-influenced)? Required before Phase 3.
- **Safe descent threshold:** descending is free, but from which height difference does a voluntary descent become a fall (with fall damage)? E.g., is stepping down −1 z always safe, and −2 z a fall?
- **Line-of-sight algorithm:** exact cell-tracing rule (which grid line algorithm, how corners and partial cover behave, how z differences translate into blocking). Required before Phase 3.
- **Push interruption by height:** what height difference blocks a push (causing collision) vs. lets the unit be pushed off an edge (causing a fall)?
- **Void terrain:** what happens to a unit pushed onto Void — infinite fall (death), fall to z 0, or something else?
- **Simultaneous deaths:** if the last units of both players die in the same resolution, is the result a draw, or does a priority rule decide the winner?
- **Turn timers:** duration of stance selection and of a unit turn; behavior on timeout (auto-pass, default stance).
- **Stance visibility after reveal:** does the revealed stance remain visible for the whole round?
- **AP/MP/HP baseline values:** per-class values are configuration, tracked by [BALANCE_GUIDELINES.md](BALANCE_GUIDELINES.md); the rulebook only fixes the mechanics.
- **Healing and Shielded interaction:** does Shielded absorb damage before or after elemental computation (pipeline steps 11–12)?
- **Frozen / Rooted exact effects:** precise rule modifications for each initial state must be specified before Phase 3 configuration work.

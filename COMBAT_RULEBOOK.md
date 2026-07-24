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

- A terrain applies its configured states to a unit **each time the unit enters the cell** (voluntarily or by forced movement).
- The duration of terrain-applied states is a configuration value per terrain (`appliedStateDurationRounds`), never a code constant.
- A terrain may be configured as `bottomless` (see Falls → Void).

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

If the configuration defines no stances, steps 3–6 are skipped and the round proceeds directly to unit turns.

### Initiative

- Players alternate unit activations: player A's next unit, then player B's next unit, and so on.
- Which player activates first rotates every round (round 1: first player in join order; round 2: second; …).
- Within one player, units act in a fixed order: their creation order at match setup.
- Dead units are skipped. If one player has more units than the other, their remaining units act in sequence at the end of the round.

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
- Descending costs no additional MP.
- Voluntarily stepping down **1 z** is safe.
- Voluntarily stepping down **2 z or more** is allowed, but the step is resolved as a **fall**: the unit takes fall damage on landing, then may continue its movement if still alive.
- **Forced movement ignores MP costs.**

---

## Line of Sight

The server computes line of sight. No line-of-sight computation is ever performed client-side for gameplay purposes.

The official algorithm (**max-endpoint rule**):

1. Trace the straight segment between the centers of the source cell and the target cell on the (x, y) plane.
2. Every cell the segment touches, excluding the source and target cells, is a **crossed** cell. When the segment passes exactly through a cell corner, **both** adjacent cells are crossed (no diagonal peeking).
3. A crossed cell **blocks** line of sight if its height satisfies: `z ≥ max(source z, target z) + 1`.
4. Line of sight exists if and only if no crossed cell blocks.

Units do not block line of sight (no rule currently says they do; changing this requires updating this section).

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

A push moves a unit cell by cell along one orthogonal direction.

- Each traversed cell is validated individually by the server.
- A push can cause: a collision, a fall, or entry onto a terrain (which applies its states).

Resolution per cell, in push order:

- **Next cell is out of bounds, occupied by a unit, or higher (+1 z or more):** the push stops there and a **collision** occurs.
- **Next cell is at the same height:** the unit enters it (terrain applies its states) and the push continues.
- **Next cell is lower (−1 z or more):** the unit is shoved over the edge and **falls** into that cell. The push ends at the landing cell; the remaining push distance is lost **without** collision damage (the push was ended by a fall, not by an obstacle).

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

### Void

Void terrain is **bottomless** (configured via the terrain's `bottomless` flag — no ad-hoc handling):

- A unit that enters Void — pushed, falling, or moving voluntarily — **dies** at the death-check step of the current resolution, regardless of remaining HP.
- No Fall event and no damage number are produced; the unit's removal is reported by the Death event.

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

- A player is eliminated when they have no living units.
- If exactly one player remains, that player wins.
- If a single resolution eliminates every remaining player simultaneously, the match is a **draw**: the Victory event carries no winner.

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

- **State re-application:** applying a state a unit or cell already has replaces the remaining duration with the new one (no stacking).
- **Heal resolution:** heal effects resolve at pipeline step 11, alongside direct damage.
- **Unit-targeted effects on an empty cell:** Damage, Heal, and Push effects fizzle (no event) if no unit occupies the target cell. ApplyState falls back to applying the state to the **cell** itself.
- **Push targeting:** a push effect requires the target cell to be axis-aligned with the caster (same row or column) and distinct from the caster's cell; otherwise the cast is rejected as InvalidTarget. The push direction is caster → target.
- **Terrain transformation under a unit:** the new terrain immediately applies its configured states to the occupant. Transforming the ground under a unit into a bottomless terrain makes the unit fall to its death.
- **Active unit dies during its own action** (e.g. voluntary fall): after the resolution completes, its turn ends automatically.
- **Walking through terrain:** every cell entered during movement applies its terrain states — passing through Water makes a unit Wet even if it does not stop there.
- **No pass-through:** a unit cannot traverse a cell occupied by another unit, during movement or pushes (one unit per cell holds at every instant).
- **Physics damage events:** Collision and Fall events carry their own damage amount; they do not emit an additional Damage event. The Damage event is reserved for spell damage (pipeline steps 11–12).

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

- **Collision damage to the blocking unit:** when a push is interrupted by another unit, does the blocker also take damage? (Currently: only the pushed unit takes collision damage.)
- **Area-of-effect spells:** the current pipeline targets a single cell. AoE shapes (cross, circle, line) are not yet specified.
- **Turn timers:** duration of stance selection and of a unit turn; behavior on timeout (auto-pass, default stance).
- **Stance visibility after reveal:** does the revealed stance remain visible for the whole round?
- **AP/MP/HP baseline values:** per-class values are configuration, tracked by [BALANCE_GUIDELINES.md](BALANCE_GUIDELINES.md); the rulebook only fixes the mechanics.
- **Healing and Shielded interaction:** does Shielded absorb damage before or after elemental computation (pipeline steps 11–12)?
- **Exact effects of the initial states** (Wet, Burning, Frozen, Electrified, Shielded, Rooted): precise rule modifications must be specified (and added here) before any of them is implemented as an engine rule. The engine's rule-modifier mechanism ships in Phase 3; the content ships once decided.
- **Elemental interaction table** (e.g. Fire on a Wet unit, Lightning on Water terrain): interactions flow through states/terrain rules; the concrete table is undecided. The propagation step is a no-op until it exists.

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
- A terrain may be configured as `opaque` (see Line of Sight). Opaque terrain does not impede movement — it only blocks sight.

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
8. When every unit has acted, **end of round** resolves (see below).
9. Next round begins.

### End of round

Step 8 resolves in this exact order:

1. **Periodic state effects** resolve, in unit creation order, then by state application order — e.g. Burning deals its damage. A state whose duration is about to expire still resolves this round.
2. **Death check**, removal of eliminated units, and the victory check — the same finalization that follows any action.
3. **State durations tick**; states that reach zero are removed.

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
3. Each crossed cell has a **sight height**: its `z`, plus 1 if its terrain is opaque. Opaque terrain (e.g. Vegetation) stands roughly one level tall, so it conceals what is beside it but not what is above it.
4. A crossed cell **blocks** line of sight if: `sight height ≥ max(source z, target z) + 1`.
5. Line of sight exists if and only if no crossed cell blocks.

High ground therefore sees over opaque terrain, while units on the same level do not.

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

### Defined state effects (V1)

- **Wet** (applied by Water terrain): the unit is slippery — **pushes against a Wet unit travel 1 cell further**. (See Pushes → Push distance resolution.)
- **Burning** (applied by Lava terrain): the unit takes **15 Fire damage at the end of each round** while Burning. (See Round Structure → End of round.)
- **Frozen** (applied by Ice terrain): the unit **cannot climb**. Any voluntary step onto a higher cell is refused, regardless of stance — Flow Stance removes the MP cost of climbing, not the inability. Forced movement is unaffected.

The effects of Electrified, Shielded, and Rooted remain open questions; none of them may be implemented before being defined here.

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

### Visibility after reveal

Once revealed, a stance stays **visible to all players for the remainder of the round**. It is cleared when the next round begins, before the next secret selection.

Secrecy applies only to the choice, not to its consequences: a stance modifies rules that players can already observe in play, so hiding it after reveal would obscure why an action resolved the way it did.

### V1 stances

The prototype ships three global stances (available to every class):

- **Iron Stance**: pushes against you are **2 cells shorter**.
- **Flow Stance**: climbing **+1 z costs no extra MP**.
- **Storm Stance**: **your pushes travel 1 cell further**.

### Push distance resolution

The effective distance of a push is computed in this exact order (rule priority: Stance before States; attacker before defender):

1. Start from the effect's base distance.
2. Apply the **pusher's** stance modifiers (e.g. Storm: +1).
3. Apply the **pushed unit's** stance modifiers (e.g. Iron: −2).
4. Apply the **pushed unit's** state modifiers, in application order (e.g. Wet: +1).
5. Clamp to a minimum of 0 (a push of 0 cells does nothing — no collision).

Modifiers stack: a Storm push against a Wet target travels 2 cells further.

### Climb cost resolution

Stance and state modifiers may change the additional MP cost of climbing (e.g. Flow Stance sets it to 0). The climb height limit itself is unchanged unless a rule explicitly says otherwise.

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
- A player who abandons the match (disconnection beyond the server's grace period) **forfeits**: the remaining player wins. Forfeits are declared by the server, not by the engine, and produce no Victory event — the server reports them separately.

---

## Timers

_Provisional values — confirmed defaults pending playtesting; the values are configuration, never code constants._

- **Stance selection**: `timers.stanceSelectionSeconds` (baseline: 30). On expiry, the server locks, for each player who has not chosen, the stance they used the previous round; in round 1 (or if that stance no longer exists), the first configured stance.
- **Unit turn**: `timers.unitTurnSeconds` (baseline: 45). On expiry, the unit's turn ends automatically.
- Timers are enforced by the server only. The engine has no wall clock: timeouts reach it as ordinary intents, preserving determinism and replayability.

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
- **Physics damage events:** Collision and Fall events carry their own damage amount; they do not emit an additional Damage event. The Damage event is reserved for spell damage (pipeline steps 11–12) and for periodic state damage at end of round.
- **States acquired mid-path:** a movement is validated in full against the unit's state at the moment the intent is received. A state picked up partway along the path (e.g. Frozen from Ice) applies from the next action onward and does not retroactively invalidate the remainder of that movement.

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
- **AP/MP/HP baseline values:** per-class values are configuration, tracked by [BALANCE_GUIDELINES.md](BALANCE_GUIDELINES.md); the rulebook only fixes the mechanics.
- **Healing and Shielded interaction:** does Shielded absorb damage before or after elemental computation (pipeline steps 11–12)?
- **Exact effects of the remaining initial states** (Electrified, Shielded, Rooted): precise rule modifications must be specified (and added here) before any of them is implemented as an engine rule. Wet, Burning, and Frozen are defined (see States).
- **Wet and Burning together:** intuitively water should quench fire, but no interaction is defined yet, so a unit can currently be both. This is the first entry the elemental interaction table will need to settle.
- **Elemental interaction table** (e.g. Fire on a Wet unit, Lightning on Water terrain): interactions flow through states/terrain rules; the concrete table is undecided. The propagation step is a no-op until it exists.

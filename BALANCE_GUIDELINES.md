# BALANCE_GUIDELINES.md — Balancing Philosophy & Content Creation Rules

Project codename: **Atlas**

This document defines how Atlas is balanced and how new content is designed. For exact mechanics, [COMBAT_RULEBOOK.md](COMBAT_RULEBOOK.md) is authoritative. For design intent, see [GAME_DESIGN.md](GAME_DESIGN.md).

---

## Balancing Philosophy

**Decisions beat statistics.**

The outcome of a match must be driven primarily by:

- positioning
- stance reads and bluffs
- use of terrain and verticality

Never primarily by raw stat advantages.

Consequences:

- Power is expressed through **options**, not through bigger numbers. A strong class offers strong choices, not strong stats.
- Damage exists to create pressure and force movement — not to end fights before tactics matter.
- Any content whose only identity is "more damage" or "more HP" is rejected by design.

---

## Readable Numbers

Every number a player must reason about mid-fight must be small, round, and predictable.

The physics constants set the tone (see the rulebook):

- Collision: **10 HP per remaining push cell**
- Fall: **15 HP per height level**

Guidelines:

- Prefer values a player can compute mentally in one step.
- No hidden multipliers, no fractional damage, no compounding percentages in V1.
- If a player cannot predict the exact outcome of an action before committing, the numbers are wrong.

---

## Data-Driven Balancing

- Every balance value lives in **configuration** in the `shared` package — never in code literals.
- Classes, spells, terrain, elements, status effects, and stances are entirely configuration-defined.
- A balance patch must be possible by editing configuration only, without touching engine code.
- Configuration changes are reviewable: one value change per commit where practical, with the reasoning in the commit message.

### Methodology

1. Change **one variable at a time**.
2. Prefer adjusting **costs and ranges** before adjusting damage.
3. Prefer adjusting **rules of use** (line of sight needed, terrain requirement, stance interaction) before adjusting numbers at all.
4. Validate through playtests and replays — the deterministic event log makes every reported imbalance reproducible.
5. Document the intent of every nerf/buff: what behavior it targets, what it must not break.

---

## Content Creation Rules

Every new piece of content must pass this checklist **before implementation**:

### For everything

- [ ] It serves at least one of the three pillars (Verticality, Living Terrain, Secret Stances).
- [ ] It interacts with at least two existing systems. Isolated systems are rejected.
- [ ] Its rules are added to COMBAT_RULEBOOK.md first.
- [ ] It integrates into the resolution pipeline without bypassing it.
- [ ] It is fully expressible as configuration (plus, at most, one new generic rule).

### For a class

- [ ] Has an identity statement in one sentence.
- [ ] Has a unique mechanic that is not a stat modifier.
- [ ] Has explicit strengths **and** explicit weaknesses.
- [ ] Uses the three pillars differently from every existing class.

### For a spell

- [ ] Is a tool (terrain manipulation, repositioning, stance exploitation, opportunity creation) — not just a damage line.
- [ ] Declares its element; elemental behavior flows through states/terrain rules, never through spell-specific conditions.
- [ ] Its full effect is predictable from public information (except where stances legitimately hide it).

### For a terrain

- [ ] Applies its effects only via states.
- [ ] Defines its reaction to every element (including "no reaction").
- [ ] Creates at least one tactical opportunity (not only a penalty).

### For a state

- [ ] Defines duration, owner, source, and effects.
- [ ] Modifies engine rules, not raw stats.
- [ ] Defines its interactions with existing states and elements (including cancellations, e.g., Wet + Fire).

### For a stance

- [ ] Modifies how the engine resolves actions — never a flat stat bonus.
- [ ] Has a clear counter: choosing it must be a risk, or it is not a read.
- [ ] Creates meaningfully different play against each other existing stance (no dominated options).

---

## Anti-Patterns (Automatic Rejection)

- Stat-stick classes (identity = numbers).
- Per-spell hardcoded interaction conditions.
- Systems that interact with nothing (isolated mechanics).
- Balance values hidden in code.
- Mechanics whose outcome the acting player cannot predict.
- A dominant stance — any stance that is correct to pick regardless of the opponent breaks the pillar.
- Content that requires modifying the resolution pipeline order (that order belongs to the rulebook).

---

## V1 Baselines (decided, provisional pending playtests)

- **Vitals:** HP 90–110, AP 6, MP 3–4. Physics damage (10 per collision cell, 15 per fall level) stays meaningful against these pools.
- **Damage budget:** roughly 5–7 damage per AP for direct-damage spells (e.g. 20 damage at 3 AP), so pushes and falls remain competitive with raw damage.
- **V1 classes:** Vanguard (HP 110, AP 6, MP 3 — close-range physical control) and Tidecaller (HP 90, AP 6, MP 4 — terrain shaping and Wet setups).
- **V1 stances:** Iron (incoming pushes −2), Flow (free climbs), Storm (outgoing pushes +1) — exact rules in [COMBAT_RULEBOOK.md](COMBAT_RULEBOOK.md).

## Open Questions

- **Balance cadence:** how often configuration changes ship once external playtesting starts.
- **Validation of the V1 baselines** above through playtesting.

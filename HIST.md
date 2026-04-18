# HIST — Deep-Time History Simulation

## Goal

Replace the narrow medieval simulation (leaders, taxes, battles, diplomacy) with a deep-time model that runs from the Stone Age (TL 0) through Early Space (TL 10). The simulation tracks only three things per province:

1. **Population** (rural only — no urban/city hierarchy at this scope)
2. **Tech Level** (0–10, continuous within a level)
3. **Nation membership** (which province owns it — no settlement hierarchy, no feudal layering)

All event types in the current system (`war`, `battle`, `succession`, `tax`, `diplomacy`, `regency`, plus the current `census`) are removed. The new event system has exactly three event types:

- `migration` — a group of people relocates to a neighboring or reachable province
- `formation` — a province/region coalesces into a new nation
- `expansion` — an existing nation absorbs neighboring territory

Anything beyond that (culture, leaders, economy, warfare) is out of scope for this pass.

---

## Why this scope

The current sim is detailed but narrow in time: it assumes settled agricultural states with tax structures, standing armies, and dynasties. That fails for 90%+ of human history. The questions this new model should answer:

- How do a few small stone-age populations in the richest pockets of the world fan out to cover it?
- When and where do the first "nations" (anything larger than a band/tribe) coalesce?
- How does the **distribution** of nation sizes change as TL rises? (Hypothesis in §9.)
- At what TL does a single polity realistically dominate a continent or the whole world?

Detail can be layered back in later once the skeleton is right.

---

## 1 — State model

### 1.1 — What gets removed

Rip out wholesale:

- `src/model/history/events/{battle,diplomacy,succession,tax,war}.ts`
- `src/model/nations/wars/**`, `src/model/nations/relations/**`
- `src/model/provinces/leader/**`
- `World.wars`, `World.dynasties`, `World.cultures`, `World.religions`, `World.faiths`, `World.heritages` (these are separate feature rollouts — not needed for this sim)
- `Province._leader`, `Province._occupations`, `Province._wars`, `Province._consumption`, `Province._relations`, `Province._children`, `Province.culture/heritage/faith/religion`, `Province.production`
- `Province._population.urban` and `targetUrban` — urbanization is not modeled at this scope
- The existing `NATION.domains._rebalance` / settlement-hierarchy system. At this scope, a nation is a flat set of provinces, not a tree.

Keep:

- World geography (cells, landmarks, coasts, mountains, climate, habitability) — this is the stage.
- `PROVINCE.neighbors` — the adjacency graph is the only topology migration and expansion need.
- `PROVINCE.habitability` — the single most important input to everything.
- `WORLD.habitability()` — total planetary carrying-capacity factor.
- Priority queue / tick loop in `HISTORY.tick` — the scheduler is fine as-is.

### 1.2 — New per-province fields

```ts
interface Province {
  // ...existing geography fields kept...
  habitability?: number

  // Nation membership is now flat. A nation IS a province.idx (the capital/seed).
  // If _nation is its own idx, this province is a sovereign nation.
  // If _nation is -1, the province is unclaimed wilderness.
  _nation: { time: number; nation: number }[]

  // Single population track (rural).
  _population: { time: number; population: number }[]

  // Per-province TL as a float. Tech diffuses through the nation and across
  // borders, so storing it per-province (not per-nation) is what lets frontier
  // regions lag and tech-cores lead.
  _tl: { time: number; tl: number }[]
}
```

Helper accessors follow the existing `findHistory` pattern (see `PROVINCE.population.rural.get`). A `NATION` object reads from `_nation` instead of walking the old parent/children chain:

```ts
NATION.provinces(nation, time)  // all provinces whose _nation === nation.idx at `time`
NATION.nations(time)            // every province where _nation === self.idx
NATION.population(nation, time) // sum of provinces' population
NATION.tl(nation, time)         // population-weighted TL of nation's provinces
```

### 1.3 — World-level fields

Add to `World`:

```ts
epoch: number           // world sim starts here (set `START_DATE` to TL-0 start)
```

Remove the year-800 start. The new epoch is Year 0 = Stone Age start.

---

## 2 — Tech Level progression

TL is stored as a float per province. Integer portion = era; fractional = progress toward the next era.

### 2.1 — Baseline table

From `notes/nations/tech.md` (Earth baseline). The **duration** column drives *both* TL progression rate and pop growth rate — the table is the single source of truth for cadence, not a separate pop-rate constant.

| TL | Era           | Duration D(i) (yrs) | Pop target N(i) | Growth rate r(i→i+1) | TL rate (/yr) |
|----|---------------|---------------------|-----------------|----------------------|---------------|
| 0  | Stone Age     | 100,000             | 100k            | 0.0039% / yr         | 1e-5          |
| 1  | Neolithic     | 5,000               | 5M              | 0.046% / yr          | 2e-4          |
| 2  | Bronze Age    | 2,000               | 50M             | 0.069% / yr          | 5e-4          |
| 3  | Iron Age      | 1,000               | 200M            | 0.092% / yr          | 1e-3          |
| 4  | Late Medieval | 500                 | 500M            | 0.094% / yr          | 2e-3          |
| 5  | Renaissance   | 200                 | 800M            | 0.314% / yr          | 5e-3          |
| 6  | Steam         | 100                 | 1.5B            | 0.693% / yr          | 1e-2          |
| 7  | Industrial    | 50                  | 3B              | 1.02% / yr           | 2e-2          |
| 8  | Machine       | 40                  | 5B              | 1.18% / yr           | 2.5e-2        |
| 9  | Atomic        | 60                  | 8B              | 0.37% / yr           | 1.67e-2       |
| 10 | Early Space   | 80                  | 10B             | —                    | 1.25e-2       |

The growth and TL rates are **derived from duration**, not independent knobs:

- `r(i→i+1)   = ln(N(i+1) / N(i)) / D(i)`  — the exponential rate that carries pop from one era's target to the next over that era's duration.
- `tl_rate(i) = 1 / D(i)`                  — one full TL advanced over its duration.

The calculated growth rates match real-world aggregate history: ~0.004% stone-age, ~0.05% neolithic, ~1% industrial, declining back through atomic/space as the demographic transition bites.

Constants live in `src/model/history/tech.ts` as a lookup table. Growth and TL rates are computed from duration + pop at module load, not hardcoded separately — this is how we stay consistent if a value is retuned.

### 2.2 — TL progression formula

For a province at TL `I`, per year:

```
dI/dt = (1 / D(floor(I))) × support^1.5 × (τ_size × τ_hab)
```

Where:

- `D(i)` = duration in years for TL i (table above). Used raw — size/hab multipliers layer on separately so the table remains the pure Earth baseline.
- `τ_size × τ_hab` = planetary modifiers. For Earth, τ = 1. For this pass, assume Earth-like world; leave the multipliers wired but set to 1.0 until we simulate alien worlds.
- `support` = `max(max_neighbor_tl - I, 1)` — a frontier province lagging the most advanced neighbor by N levels progresses `N^1.5` faster. This is how diffusion works: the leading edge sets the pace for its neighborhood.

This collapses to pure baseline (1/D(i)) for an isolated uniform civilization and gives dramatic catch-up for frontier/colony provinces — which is what we want once maritime TLs (3+) start seeding distant coasts.

### 2.3 — Advancement gating

A province cannot cross an integer TL boundary unless its population ≥ the floor-adjusted target for that TL scaled by its habitability share:

```
required_pop(i) = tech.pop[i] × (province.habitability / world.totalHabitability)
```

This is the crucial coupling: a 50-person band cannot "invent agriculture" into TL 1; it has to grow first. Likewise a few million farmers cannot bootstrap the Industrial Revolution. This gating is what makes pop and TL co-evolve instead of running independently.

### 2.4 — TL tick cadence

TL updates on the same cadence as population (see §3.4). One combined `progression` event per year (global), not per province — the per-year scaling is linear, so cost stays bounded.

---

## 3 — Population dynamics

### 3.1 — Initial conditions

At world spawn:

1. Compute habitability per province (already done in `PROVINCE.population.init`).
2. Rank provinces by habitability, take the top ~5–10 on the most habitable continent(s) — not a fixed count; select until cumulative habitability clears some threshold (e.g., top 1% of world habitability).
3. Give each seed province a starting population drawn from the 100k world total distributed by habitability weight. These are the ~5 initial "civs" — really bands.
4. All other provinces start at population 0 (unclaimed wilderness).
5. All seeds start at TL 0.
6. Each seed forms a nation of size 1 (itself).

Total starting pop ≈ 100,000 across the seed provinces (matches tech.md's stone-age value).

### 3.2 — Growth formula

Per province per year:

```
dN/dt = N × ln(N(i+1) / N*) / D(i)
```

Where `i = floor(TL)`. This is the tech.md target-based logistic, rewritten to make explicit that the era's duration `D(i)` *is* the thing setting the pace. No separate "growth cap" table — the duration table already encodes the right rate at each era. If the sim later needs a hard cap (e.g., to prevent a 5% spike under extreme carrying-capacity gradients), it's one-liner bolt-on, but the baseline derives from D alone.

`N*` (the reference pop) picks the regime:

| Regime     | Condition                        | N*    | Effect                        |
|------------|----------------------------------|-------|-------------------------------|
| Undershoot | N < N(i) × habitabilityShare     | N     | Catch-up: rate = ln(N(i+1)/N) / D(i), large positive |
| In range   | N(i)·hS ≤ N ≤ N(i+1)·hS          | N(i)·hS | Steady rate = r(i→i+1) from the table |
| Overshoot  | N > N(i+1) × habitabilityShare   | N     | Decay: ln(N(i+1)/N) is negative |

`habitabilityShare = province.habitability / world.totalHabitability`. So each province has its own scaled targets; the world's aggregate sum matches the tech.md global targets.

The growth rate column in §2.1 is what a province sees in the "in-range" regime. Undershoot can run much faster (frontier provinces with rich carrying capacity but low current pop — this is what fills a continent after a TL-3 coastal colonization). Overshoot decays as negative dN — the mechanism that pushes the overshoot into migration events (§4.1).

### 3.3 — Carrying capacity

A province's carrying capacity at TL `i` is:

```
capacity(p, i) = tech.pop[i] × (p.habitability / world.totalHabitability) × (p.land / world.avgLand)
```

A province over capacity for its current TL decays (tech.md overshoot regime). Migration out of overcrowded provinces is triggered by this overshoot (see §4.1).

### 3.4 — Schedule

One global `progression` event per simulated year handles pop growth, TL progression, migration pressure check, and expansion check. Per-province loops inside, no per-province scheduling. This matches the existing `POPULATION_EVENT` structure but is the only recurring event type.

---

## 4 — Migration events

### 4.1 — Trigger conditions

A migration event is scheduled when a province satisfies any of:

1. **Overshoot** — `population > capacity × k_overshoot` (k ~ 1.1). Highest-pressure source.
2. **Neighbor gradient** — a province's population density is ≥ 2× a neighbor's, and the neighbor has unused capacity. Models gradual spread into less crowded land.
3. **Coastal jump (TL ≥ 2)** — a coastal overshoot may seed a distant coastal province across a sea, not just an adjacent one. Range scales with TL (Bronze Age: same coastline, regional seas; Medieval: cross-ocean; Industrial: anywhere coastal).
4. **Long-range leap (TL ≥ 7)** — any-to-any province, with probability ∝ destination habitability / distance. Models modern voluntary migration.

### 4.2 — Mechanics

A migration event moves a fraction of the source population to the destination:

- Fraction = `min(excess / source_pop, migration_cap)` where `migration_cap` is TL-dependent (tiny for stone age ~2%, larger for modern ~15%).
- The migrant group brings the **source's TL** (this is how tech spreads geographically).
- The destination province:
  - If unclaimed (wilderness, `_nation === -1`): becomes part of the source's nation. This is the frontier-colonization path.
  - If owned by the source's nation: just a pop transfer.
  - If owned by another nation: adds to that nation's pop. Wars are not modeled, so this is de facto assimilation. (A future iteration might model failed/successful assimilation by culture distance.)
- Destination TL is blended: `new_tl = weighted_avg(dest_pop × dest_tl, migrant_pop × source_tl)`.

### 4.3 — Range scaling with TL

Maximum migration distance per event:

```
TL 0:  1 hop (adjacent only)
TL 1:  1–2 hops
TL 2:  2–3 hops, coastal jumps within same sea
TL 3:  coastal jumps continent-scale
TL 4:  trans-oceanic coastal jumps possible (Polynesian / Viking / Age-of-Sail)
TL 5+: trans-oceanic routine
TL 7+: any-to-any (mass transit)
```

These aren't hard limits — they're the max range at which a migration event can target. Most migrations stay short even at high TL.

---

## 5 — Nation formation events

### 5.1 — Trigger

A `formation` event fires on a wilderness-adjacent population cluster when:

- The cluster (unclaimed provinces with connected population) reaches a pop threshold that scales with TL.
- TL ≥ some minimum (TL 1 for the very first proto-states — i.e., the Neolithic revolution is the earliest "nation" can exist).

Below TL 1, seeds are "bands," not nations — they're tracked as nations of size 1 for bookkeeping but carry the semantic weight of a band/tribe.

### 5.2 — Mechanics

- Picks the highest-habitability province in the cluster as the seed/capital.
- All connected unclaimed provinces with population get assigned `_nation = seed.idx`.
- This happens rarely in practice because most of the world is already claimed by the migration-forward-frontier system. Formation mostly fires early in the sim (first Neolithic states) or after nation collapse.

### 5.3 — Nation collapse

If a nation's population drops below a viability threshold (TL-dependent), it dissolves: all provinces become unclaimed (`_nation = -1`). This can happen via overshoot → decay, or via emigration draining the core. Dissolution is the only way the total nation count decreases; formation and schism (§6.3) are the only ways it increases.

---

## 6 — Nation expansion events

### 6.1 — Trigger

An `expansion` event fires on a nation when:

- It has higher average TL than a neighboring nation by ≥ some threshold, **and**
- Its population exceeds its current territory's capacity by ≥ some threshold, **and**
- It rolls the expansion probability for its TL (higher TL = higher expansion rate, since communication/transport/coordination are easier).

No wars, no diplomacy — this is the abstract "more advanced and more crowded polity absorbs a less advanced neighbor." It's a stand-in for the aggregate effect of conquest, assimilation, trade dominance, and peaceful absorption.

### 6.2 — Mechanics

- Pick the weakest (lowest TL, lowest pop) neighboring nation.
- Transfer all of that nation's provinces into the expanding nation.
- The absorbed nation ceases to exist.
- The expanding nation's TL of absorbed provinces is set to `max(own_tl, absorbed_tl)` (expansion spreads the higher tech — usually the expander's, but not always).

### 6.3 — Schism

Large nations at TL below ~7 schism with probability ∝ size and ∝ distance-from-capital of their furthest province. This models the historical reality that pre-industrial empires of Roman/Han/Abbasid scale never remained unified long. Specifically:

- If nation.size × avg_dist_from_capital > threshold(TL), roll schism.
- On schism, split the nation along the geography that's furthest from the capital. The split province becomes a new nation seed; all its contiguous co-provinces go with it.

Schism rate drops sharply at TL 7+ (rail, telegraph, centralized administration). At TL 9+ it effectively vanishes.

---

## 7 — Event system changes

### 7.1 — Tick loop

`HISTORY.tick` keeps its existing structure. The `FutureEvent` union is reduced to three event types:

```ts
type FutureEvent =
  | { type: "progression"; time: number }  // annual global pass
  | { type: "migration"; time: number; source: number; destination: number; fraction: number }
  | { type: "formation"; time: number; seed: number }
  | { type: "expansion"; time: number; nation: number; target: number }
```

`progression` is the only recurring event — it's rescheduled at the end of its handler. The other three are spawned by the progression pass as needed; they're consequences, not sources of cadence.

### 7.2 — HistoryNote tags

New note tags for the event log, replacing the current set:

- `"tl advance"` — a province crosses an integer TL boundary.
- `"migration"` — a migration event occurred.
- `"nation formed"` — new nation created.
- `"nation dissolved"` — collapse.
- `"nation expanded"` — absorbed a neighbor.
- `"nation schism"` — split into two.

### 7.3 — Cadence & performance

One `progression` event per year is conservative. At 50k provinces (typical grid) and 100k years of stone age, naive implementation is 5B province-years. Optimizations:

- Stone age (TL 0) progression runs on a coarser cadence — one pass per 100 years, not 1 per year. Populations barely move.
- Cadence tightens as TL rises: TL 0 = 100y, TL 1 = 10y, TL 2 = 5y, TL 3+ = 1y. This keeps event count roughly uniform across eras despite their hugely different real-time spans.
- Only provinces with population > 0 are iterated — wilderness is free.

---

## 8 — UI

For this pass, keep the existing globe/map view. Change:

- Province color = nation color (as today), but wilderness provinces render as their biome color (not gray).
- Add a TL heatmap overlay as an optional display mode.
- Add a "pop density" overlay.
- Scrub-through-time should remain functional — all three tracked fields (`_nation`, `_population`, `_tl`) are history arrays, so the existing time-slider wiring just needs to know about the new fields.

Detailed UI polish is out of scope; just don't regress the scrubber.

---

## 9 — Expected nation-size distribution across TLs

This is the falsifiable hypothesis the model should reproduce. If the finished sim doesn't show roughly this shape, the constants need tuning.

| TL   | Typical nation count | Size distribution                                                      |
|------|----------------------|------------------------------------------------------------------------|
| 0    | 5–20 bands           | Tiny, all size-1. Bands, not nations. Most of world is wilderness.    |
| 1    | 50–200               | Mostly small (1–3 provinces). Long tail absent. Pockets of settlement.|
| 2    | 100–300              | Heavy-tailed — first "kingdoms" emerge (5–15 provinces) alongside many small. |
| 3    | 50–150               | Very heavy-tailed. 2–4 large empires (30–80 provinces) + lots of small. Schisms common. |
| 4    | 40–100               | Similar to TL 3, slightly more concentrated. Coastal states punch above size. |
| 5    | 30–80                | Colonial reach distorts distribution — small home nations project power far. |
| 6    | 25–60                | First nations >100 provinces stable (industrial coordination). |
| 7    | 15–40                | Strong consolidation. Typical size jumps. Schism rate collapses. |
| 8    | 10–30                | Very few small nations survive. Median size large. |
| 9    | 5–20                 | Superpower era — 2–4 nations hold majority of pop/territory. |
| 10   | 3–15                 | Near-consolidation. World-spanning blocs. |

Aggregate features the model should produce:

1. **Neolithic explosion at TL 1→2** — nation count should ~5× between these eras as agriculture spreads.
2. **Iron-age peak empires** — the first `size > 50` nations should appear at TL 2–3 and mostly schism within the same era.
3. **Industrial consolidation** — from TL 6 onward, size distribution's tail extends and its head thins.
4. **Homogenization at TL 9+** — Gini coefficient on province-per-nation should trend high (few big nations).

These are expectations, not assertions; the sim is the experiment. If it produces something materially different, the interesting question is *why* — the model might be telling us something real about the parameter space.

---

## 10 — Testing

### 10.1 — Unit tests

Co-located with each module. One behavior per test (AAA, descriptive names).

- `history/tech.test.ts` — TL progression for an isolated province matches baseline durations within tolerance; support factor accelerates laggards correctly; gating prevents advance before pop threshold.
- `history/population.test.ts` — growth regime (undershoot/in-range/overshoot); growth cap honored; habitability scaling of target pop.
- `history/events/migration.test.ts` — overshoot trigger fires; gradient trigger fires; TL range caps distance correctly; migrants carry source TL; destination TL blends by weighted mean; wilderness destinations get nation assignment.
- `history/events/formation.test.ts` — cluster-of-unclaimed + threshold triggers formation; capital placement picks highest habitability; all connected claimed.
- `history/events/expansion.test.ts` — trigger requires TL gap AND pop pressure; absorbs weakest neighbor only; absorbed provinces' TL raised to max of the two; schism fires on oversized low-TL empires and splits along geography.
- `nations/index.test.ts` — `NATION.provinces`, `NATION.population`, `NATION.tl`, `NATION.nations` return correct values at historical times.

### 10.2 — Integration / regression scenarios

Full sim runs used as behavioral assertions.

- **Stone age isolation** — seed world; fast-forward 100k years; assert total population reaches ~5M (TL 1 target) and that TL 1 is reached across the seeded continent but not isolated ones.
- **Neolithic diffusion** — run to year ~100k; assert at least N separate first-formation events (proving independent Neolithic hearths).
- **Empire schism** — place a size-60 nation at TL 3 with distant frontier provinces; run 500 years; assert schism occurred.
- **Industrial consolidation** — seed world with many small nations at TL 5; run to TL 8; assert median nation size ≥ some threshold and count decreased.
- **Monotone world pop** — world total pop, smoothed over 50 years, should be non-decreasing through TL 0→10 (tech.md allows a TL 11+ dip, but we stop at 10).
- **Nation distribution shape** — at TL 3, Gini of nation-size should be higher than at TL 1 (heavier tail emerged).

These are checked-in tests that run as part of `pnpm test`. They're slow-ish; mark them with a `@slow` tag or similar convention, but don't skip them in CI.

### 10.3 — Seeded determinism

All stochastic choices go through `window.dice` (existing convention). Every test fixes a seed and asserts concrete numbers, not just ranges, for a regression signal.

---

## 11 — Implementation plan

Phased so each phase is shippable and testable.

### Phase 0 — Strip

Remove battle/war/diplomacy/tax/succession/regency and all their supporting types and fields. Tests for those get deleted (not skipped). Goal: a world that spawns, initializes population, and does nothing else but tick time. `pnpm lint && pnpm typecheck && pnpm test` pass.

### Phase 1 — New state model

Flatten `_nation` onto `Province`, remove `_children`/`_parent` settlement hierarchy, drop `_leader/_occupations/_wars/_consumption/_relations`, replace `_population` with rural-only, add `_tl`. Update `PROVINCE` and `NATION` accessor modules. Unit tests for each accessor.

### Phase 2 — New init

Change `START_DATE` to epoch 0. Rewrite seed: select top-habitability provinces, distribute 100k pop, set TL 0, make each a 1-province nation. Tests for seed selection, pop distribution, nation creation.

### Phase 3 — Progression loop

Implement the single `progression` event: pop growth, TL progression, gating. Unit tests for each sub-mechanic in isolation plus an integration test for a single isolated province reaching TL 1 in ~100k years (±20%).

### Phase 4 — Migration

Implement all four migration triggers and the range-by-TL rule. Tests for each trigger, tests for the fraction/TL-blend math, integration test that a seeded continent fills in over 50k years.

### Phase 5 — Formation & expansion & schism

Formation, expansion (with TL/pop gates), and schism. Tests for each trigger, integration test covering the full TL 0→5 arc and asserting a plausible nation-size distribution.

### Phase 6 — Tuning

Run the full TL 0→10 sim, compare against §9's expected distributions, tune constants:

- Migration fractions and ranges
- Schism threshold curve
- TL progression τ
- Pop growth caps

This is where the model earns its keep. Constants live in one file (`src/model/history/constants.ts`) so tuning is a single-file sweep.

### Phase 7 — UI

Wilderness biome coloring, TL heatmap overlay, pop-density overlay, time-scrubber verification.

Each phase ends with `pnpm lint && pnpm typecheck && pnpm test` passing. No phase should leave the main branch broken.

---

## 12 — Open questions / deferred decisions

- **Multiple worlds / size / hab multipliers** — tech.md specifies these; wiring is trivial but we set them to 1.0 for the first pass. Revisit when we care about alien worlds.
- **Patron TL support factor** — tech.md mentions uplift. Not modeled here; colonies will inherit parent TL via migration, which is close enough.
- **Culture / language / religion** — explicitly deferred. They belong in a parallel "actors" pass once the history skeleton is trusted.
- **Climate change driving migration** — tech.md doesn't cover this, but real history has it (desertification of the Sahara, ice-age retreats). Optional layer once basic migration works.
- **Collapse / dark ages** — partially covered by overshoot-decay and schism. No explicit catastrophe events (plague, volcanic winter) in this pass; can be added as single-shot events later.
- **Nation "identity"** — currently a nation IS a seed province. If the seed province is absorbed or its population crashes, the nation dies. This is a simplification; "nation continuity" across capital changes is a later problem.

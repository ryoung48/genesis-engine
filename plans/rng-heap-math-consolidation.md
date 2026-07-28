# RNG / Heap / Math Consolidation Plan

Audit of `src/model` found duplicate heap implementations, duplicate/adapter RNG
code, duplicate generic math helpers outside `shared/`, and one dead-code module.
This plan tracks the fixes to confirm before implementation starts.

## 1. Heap consolidation

Four separate priority-queue/heap implementations exist for the same class of
Dijkstra-style shortest-path problems:

- `src/model/shared/min-heap/index.ts` — `MinHeap`. **Canonical.** Used by
  pathfinding, trade routing (land+sea+network), erosion, rivers, lakes (7 call sites).
- `src/model/society/population/index.ts:162-213` — private `MinHeap` duplicate
  (key/val parallel arrays instead of external key array). Used once, in the
  population-spread Dijkstra at lines 395-414.
- `src/model/geography/terrain/provinces/index.ts:441-497` — inline hand-rolled
  heap over 3 parallel arrays (`heapCost`/`heapRegion`/`heapProvince`), explicitly
  commented as a from-scratch reimplementation.
- `src/model/shared/math/stats/index.ts` — uses third-party
  `@datastructures-js/priority-queue` instead of `MinHeap`, for
  `computeOceanDistanceBFS` / `computeCoastDistances`.

Not flagged: `src/model/history/generated/event-heap/index.ts` (`EventHeap`) —
materially different shape (multi-field payload, auto-growing capacity keyed by
sim time), looks like a legitimate specialization, not a duplicate.

**Proposed fix:**
- Extend `shared/min-heap.MinHeap` to optionally carry a parallel value array
  (generic payload), covering the population and provinces use cases.
- Migrate `population/index.ts` and `terrain/provinces/index.ts` onto it; delete
  their private heaps.
- Migrate `shared/math/stats/index.ts` off `@datastructures-js/priority-queue`
  onto `MinHeap`; drop the npm dependency.

## 2. RNG adapter consolidation

Two shared random entry points already exist and are both legitimate, not
duplicates of each other:
- `shared/random/rng/index.ts` — `RNG.createRng` / `RNG.createStringRng` →
  `SharedRng` (random/uniform/randint/choice/weightedChoice/shuffle/sample/weightedSample).
- `shared/random/dice/index.ts` — `DICE.rollDice/roll2d6/roll2d5/roll3d6`, a
  helper built *on top of* `SharedRng` (takes `Pick<SharedRng, "randint">`).

**Also remove: `GenesisRng` / `HistoryRng`.** Both are just `Pick<SharedRng, ...>`
type aliases with no runtime wrapper — clutter, not meaningfully narrower typing.
- `GenesisRng` (`shared/random/rng/types.ts:7`) — 3 usages, all in `mesh/types.ts`
  (`rng: GenesisRng` at lines 34, 40, 58). Replace with `rng: SharedRng`.
- `HistoryRng` (`history/generated/history-rng/types.ts:3`) — ~40 usages across
  `history/generated/types.ts`, `history/generated/state/types.ts`, and every
  `history/generated/events/*/types.ts` file (war, succession, diplomacy,
  culture-spread, battle). Replace every `rng: HistoryRng` with `rng: SharedRng`.
  `createHistoryRng()` (`history-rng/index.ts:4`) already just calls
  `RNG.createRng({ seed })` — change its return type to `SharedRng` and delete
  the `history-rng/types.ts` file. Keep the `HISTORY_RNG.createHistoryRng`
  function itself (it's a real, useful named constructor), just drop the
  bespoke type.

**The one real adapter to remove:** `society/language/languages/rng/index.ts`
- `wrapSharedRng()` copies `SharedRng` 1:1 into a same-shaped `LanguageRng`
  interface (`society/language/languages/types.ts:207`), except it turns the
  `random()` method into a `random` **getter property**. Pure indirection, no
  added behavior.
- 13 call sites currently read `dice.random` (property) instead of
  `dice.random()` (method), across:
  `clusters/index.ts` (5), `builder/vowels/index.ts` (1), `builder/index.ts` (1),
  `languages/index.ts` (5), `internal/index.ts` (1).
- `createLanguageRng(seed)` is called wherever a language RNG is instantiated;
  replace with `RNG.createStringRng({ seed, options: { nonPositiveWeightBehavior: "first" } })`
  directly.

**Proposed fix:**
- Delete `languages/rng/index.ts` and the `LanguageRng` type.
- Replace all `LanguageRng` type references with `SharedRng` (shared type import).
- Replace all `createLanguageRng(...)` calls with `RNG.createStringRng(...)`.
- Update the 13 `.random` → `.random()` call sites.

Separately: `trade-goods/index.ts:87-102` has a local `weightedPick` that
reimplements `SharedRng.weightedChoice` (still seeded correctly, just
reinvented). Replace with `rng.weightedChoice`.

Minor nit (optional): `language/languages/internal/index.ts:631` does
`~~(src.dice.random * valid.length)` instead of `dice.choice(valid)` — cosmetic,
fold into the `.random()` pass above if convenient.

## 3. Generic math utilities outside `shared/`

Baseline already in `shared/math/core`: `clamp`, `clamp01`, `smoothstep`,
`eulerVelocityAt`, `getRegionLatLonDegrees`, `piecewise`.

**Duplicates to consolidate:**

| Function | Locations | Fix |
|---|---|---|
| `clamp({value,min,max})` | `celestial/planet/environment/density/index.ts:10`, `.../classification/hydrosphere/index.ts:11`, `.../classification/dice-table/index.ts:16`, `climate/tidal-locked/ocean-currents/index.ts:24` | Delete local copies, use `MATH.clamp` |
| `normalize(values)` (sum-to-1) | `society/eras/index.ts:123`, `society/nations/index.ts:1265` | Identical logic in both. Add `MATH.normalize`, use in both |
| `smoothstep(t)` | `climate/ebm/albedo/index.ts:6` | Near-dupe of `MATH.smoothstep` with a different (single-arg) signature — consolidate |
| `lerp({start,end,position})` | `celestial/star/index.ts:88` | Third lerp variant (others split across `shared/` already) — consolidate to one |

**Real gaps, not duplicates (lower priority, optional):**
- `geography/tectonics/mantle/index.ts:36-56` hand-rolls Vec3 math
  (`dot`/`cross`/`sub`/`length3`/`normalize`) — no vector utility exists in
  `shared/math` at all. Candidate to promote, not urgent.
- `geography/terrain/hazards/index.ts:21` has `percentile({values,q})` —
  `shared/math/stats` is misleadingly named (only has mesh/BFS functions, no
  generic percentile). Candidate to promote, not urgent.

## 4. Dead code: `PLANET_CODE`

`src/model/genesis-params/code/index.ts` (`PLANET_CODE.encodePlanetCode` /
`decodePlanetCode`) — a base36 codec for `GenesisParams` (seed + world-gen
sliders), intended as a shareable "world save code." Confirmed via grep: it is
imported **nowhere** except `generate-default-world.smoke.test.ts`. No UI
component or pipeline uses it. This is unrelated to `src/model/celestial/planet`
(different concept entirely — a config codec, not planet simulation).

**Needs a decision, not yet planned:** delete it (and rewrite the smoke test to
build params directly), or keep it if it's meant to back a not-yet-built
"share this world" UI feature. Recommend checking git blame/commit intent before
deciding.

## 5. Move `genesis-params` into `pipelines`

`src/model/genesis-params/{code,ranges}` holds `GenesisParams` types/ranges and
the `PLANET_CODE` codec. Decision: move it under `src/model/pipelines/genesis-params`
(`pipelines/generate-world` is a consumer).

**Scope:**
- Use `scripts/refactor/move-module.mjs src/model/genesis-params src/model/pipelines/genesis-params`
  to move the folder — it rewrites every importer (relative and `@/...` alias)
  project-wide, so `sliders.ts`, `star-stats.tsx`,
  `generate-default-world.smoke.test.ts`, and `generate-world/{index,types}.ts`
  all get repointed automatically instead of by hand.
- The two UI files will import from `pipelines/genesis-params` going forward —
  accepted as the intended dependency direction per this decision.
- Verify with `npm run typecheck` after the move.

## Not changing

- `EventHeap` (history/generated) — distinct enough, legitimate specialization.
- `DICE` — legitimate helper built on `SharedRng`, not a duplicate adapter.
- `celestial/planet` module generally — actively used (`GenesisView.tsx`, system
  generation, wiki orbit stats), not dead.
- Unseeded `Math.random()` in UI/particle-effect code — intentional, not
  simulation logic.

## Suggested order

1. RNG: remove `LanguageRng` adapter, fix `trade-goods` weightedPick (small, isolated, mechanical).
2. Math: dedupe `clamp`/`normalize`/`smoothstep`/`lerp` (small, mechanical).
3. Heap: extend `MinHeap`, migrate 2 call sites, drop npm dependency (touches pathfinding-adjacent code, test carefully).
4. Decide + act on `PLANET_CODE` dead code.
5. Optional: promote mantle Vec3 ops and hazards `percentile` into `shared/math`.

# Idealized `src/model` Domain Hierarchy & Refactor Plan (excluding `celestial/`)

Scope: everything under `src/model` except `celestial/` (that subtree has its own plan: `plans/fix-celestial-namespace-shims.md`).

## Method (revision 2)

The previous version of this plan was written before ten commits (`shared`, `pathfinding`, `settlements`, `celestial`, `pipelines`, `tectonics`, `terrain`, `mesh`, `root`, `import alias`) landed most of its structural intent already — but via a pattern the old plan didn't anticipate: every real sub-concern was promoted to its own namespaced `<name>/{index.ts,types.ts}` submodule, while the *category* folders (`climate/`, `society/`, `economy/`, `tectonics/`, `terrain/`) were left as **bare directories with no top-level `index.ts`** — consumers import each sub-domain directly, matching the `celestial/` precedent in AGENTS.md ("a folder that only groups unrelated domains is a category, not a domain... don't give it its own namespace object").

This revision re-audits current state directly (not the old plan's assumptions) and designs around that already-landed bare-category pattern instead of the old plan's "thin delegating `index.ts` per category" idea.

---

## Part 1 — Idealized target hierarchy

```
src/model/
├── mesh/                      # done — no change
├── shared/                    # utilities — reorganized, see below (generic helpers only)
│   ├── random/                #   bare category dir: dice/, rng/, seeds/, seed-label/, identity-seeds/
│   ├── color/                 #   bare category dir: color-interpolation/, color-palettes/
│   ├── math/                  #   bare category dir: math/, stats/, simplex-noise/
│   ├── text/, time/, units/, min-heap/, urquhart/   # stay flat — standalone single-purpose primitives
│   └── node-png/               #   moved in — generic PNG decoder, not orchestration
├── genesis-params/             # NEW — moved OUT of shared/: not generic utilities, this is
│   ├── code/                   #   GenesisParams-specific domain logic (encode/decode + UI tuning ranges)
│   │                           #   renamed from shared/planet-code/
│   └── ranges/                 #   renamed from shared/slider-ranges/
├── genesis.worker.ts          # orchestration entry — stays flat
├── worker-protocol/           # NEW — GenesisWorkerRequest/Response, SerializedGenesisWorld,
│                               #   SerializedHistoryFrame, SerializedNetwork, SerializedSphereMesh
│                               #   pulled out of transport/types.ts (the worker's message contract,
│                               #   not part of the Route domain's shape)
├── pipelines/                  # orchestration scripts — stays flat (node-png/ removed, see shared/)
│
├── geography/                  # bare category dir, NO index.ts/types.ts of its own
│   ├── tectonics/              #   moved from src/model/tectonics/, unchanged internally
│   └── terrain/                #   moved from src/model/terrain/, unchanged internally;
│                                #   still owes its own types.ts (GenesisLandmarks etc.
│                                #   currently exported raw from landmarks.ts)
│
├── climate/                    # bare category dir — already correct
│   └── tidal-locked/           #   renamed from locked/ for clarity against wind/rain/ocean-currents siblings
│
├── society/                    # bare category dir
│   ├── language/, script/, nations/, population/, eras/, religion.ts, culture.ts,
│   │   heritage.ts, urbanization.ts, hierarchy.ts, timezone.ts, water-access.ts,
│   │   gender-system.ts, settlement-tuning.ts (as-is)
│   ├── graph-partition/        #   renamed from shared/ — computeGraphPartition is core
│   │                           #   partitioning logic reused by nations/locations, not a generic utility
│   └── infrastructure/         #   bare sub-category dir, NO index.ts of its own
│       ├── settlements/
│       ├── trade/              #     renamed from economy/ (trade-goods + trade-goods-table data asset)
│       │   └── routing/{land,sea,network}/   # split out of economy/routes/ (1221 lines,
│       │                                     #   three existing internal phases)
│       ├── pathfinding/
│       └── transport/          #     trimmed to just Route/RouteEdge/ROUTE_* once worker-protocol/ is pulled out
│
└── history/                     # bare category dir, NO index.ts/types.ts of its own — two sources
    │                             #   of the same concept (per-tick world state over time)
    ├── generated/                #   renamed from history/{index.ts,types.ts,derive/,eu4-days/,
    │                             #   event-heap/,events/,fields/,history-rng/,snapshot/,state/,
    │                             #   timeline/} — keeps the real HISTORY namespace (simulateUntil, etc.)
    └── earth/                    #   moved in from top-level earth/; earth/history/* flattens up to
                                  #   earth/* directly in the same move (the extra "history" nesting
                                  #   was redundant even before the merge)
```

### Why `geography/` and `infrastructure/` stay bare (no barrel), and `earth/` nests under `history/`

- `geography/` and `infrastructure/` follow the same shape as `celestial/`: a folder that groups related-but-distinct real sub-domains gets no namespace object of its own, only physical grouping. `tectonics/` → `terrain/` is a genuine pipeline dependency (plate output feeds elevation/erosion directly); `infrastructure/`'s five domains ("things that move people/goods") share the same kind of grouping cohesion celestial has for star/moon/system.
- `earth/` today contains nothing but `earth/history/*` — it's already 100% historical-state data, just sourced from real-world imports instead of the simulation engine. `history/generated/` and `history/earth/` are two sources of the same concept (world state over time), not two unrelated domains that happen to share a word — that's the same "real sub-domains, no shared namespace" shape as `geography/`'s `tectonics/`+`terrain/`. `history/` becomes a bare category dir; the real `HISTORY` namespace (`simulateUntil`, etc.) moves down into `history/generated/` since it's specific to the simulation engine, not the category as a whole.

### `shared/` reorganization

`shared/` currently has 17 flat sibling folders plus a dead `types.ts` (0 bytes) — no internal grouping despite clear thematic clusters, and two folders that aren't generic utilities at all:

- **Dead file**: `shared/types.ts` is empty — delete it.
- **Misplaced domain logic**: `shared/planet-code/` (365 lines) and `shared/slider-ranges/` (38 lines) are `GenesisParams`-specific, not generic reusable utilities — `planet-code` imports `celestial/star/types`, `pipelines/types`, and `society/eras` directly to encode/decode a genesis-params code string; `slider-ranges` defines the UI tuning ranges for those same params and is consumed directly by `src/ui/planet/screen/generation/sliders.ts` and `star-stats.tsx`. This is domain-specific logic dumped in the generic catch-all — the inverse of AGENTS.md rule 42. Move both into a new top-level `genesis-params/` domain as `code/` and `ranges/`.
- **Remaining 14 folders are genuinely generic** but ungrouped. Natural clusters, each a bare category dir (no `index.ts`) matching the pattern used elsewhere:
  - `random/` — `dice`, `rng`, `seeds`, `seed-label`, `identity-seeds` (seeded-RNG concerns; already interdependent — `seed-label`→`rng`+`seeds`, `identity-seeds`→`rng`)
  - `color/` — `color-interpolation`, `color-palettes`
  - `math/` — `math`, `stats`, `simplex-noise`
  - `text/`, `time/`, `units/`, `min-heap/`, `urquhart/` stay flat, standalone — pairing `min-heap` (data structure) with `urquhart` (geometry algorithm) into a contrived "structures" bucket isn't worth it for two loosely-related items.

---

## Part 2 — Ordered refactor plan

Each step is independently landable and typecheck/lint-clean. Run `pnpm lint` and `pnpm typecheck` after each step, not just once at the end.

1. **Extract `worker-protocol/`** out of `transport/types.ts`: move `GenesisWorkerRequest`, `GenesisWorkerResponse`, `SerializedGenesisWorld`, `SerializedHistoryFrame`, `SerializedNetwork`, `SerializedSphereMesh` to `src/model/worker-protocol/{index.ts,types.ts}`. `transport/` keeps only `Route`, `RouteEdge`, `ROUTE_LAND_MAJOR/MINOR/SEA`, `forEachEdge`, `networkCount`, `SerializedRouteKind`. Update `genesis.worker.ts` and all importers.

2. **Move `pipelines/node-png/` into `shared/`.** Generic PNG decoding utility, not pipeline orchestration.

3. **Rename `climate/locked/` → `climate/tidal-locked/`.** Update importers.

4. **Rename `society/shared/` → `society/graph-partition/`.** Confirm its export is a real namespace object (`GRAPH_PARTITION` or similar) rather than free functions; wrap if not. Update importers.

5. ~~Extract the duplicated weighted-graph search core out of `economy/routes/` and `pathfinding/`.~~ **Re-audited at execution time — the plan's premise is stale.** `economy/routes/index.ts`'s edge-cost model is no longer a copy of `pathfinding/index.ts`'s: `routes` now builds its candidate graph via Urquhart triangulation and uses a flat `ROUTE_TUNING` land/sea/coastal cost table, while `pathfinding` still does the topography/vegetation speed-multiplier Dijkstra. Their `SearchWorkspace` shapes and search loops are genuinely different, not copies. The only real duplication found was the `pairKey` helper (byte-identical in both files) — extracted into `pathfinding/index.ts`, exported as `PATHFIND.pairKey`, and `economy/routes/index.ts` now imports it instead of redefining it. No further action needed here; logged per AGENTS.md's "Rule violations" section instead of forcing a merge that doesn't reflect the current code.

6. **Split `economy/routes/` (1221 lines)** into `routing/{land,sea,network}/`, matching its existing internal phase grouping. ~~Extract remaining inline param/result types into each sub-folder's own `types.ts`~~ — deferred: `types.ts` stayed as one shared cross-phase file at `routing/types.ts` (moved as-is from `economy/routes/types.ts`); splitting it per sub-folder is left as a follow-up, logged per AGENTS.md's "Rule violations" section.
   - Executed: `land/` and `sea/` each got their own `index.ts` with the relevant functions exported; `network/index.ts` holds the `computeRoutes` orchestrator and `ROUTES` namespace, importing from both.
   - Discovered during the split: `land`↔`sea` (via `tangentProjectFlat`/`reconstructPathFromTree`) and `network`↔`land`/`sea` (via `ROUTE_TUNING`/`routePopulationThresholds`) would have been circular imports. Resolved by moving `tangentProjectFlat`/`reconstructPathFromTree` into `pathfinding/` (exported via `PATHFIND`, alongside `pairKey` from step 5 — genuinely generic graph-search primitives, not routing-specific) and extracting `ROUTE_TUNING`/`routePopulationThresholds` into a new flat `routing/route-tuning.ts` (single-purpose config, same shape as `society/settlement-tuning.ts`).

7. **Rename `economy/` → `trade/`**, containing `trade-goods/`, `trade-goods-table/` (data asset, stays unsplit), and the new `routing/` from step 6.

8. **Assemble `society/infrastructure/`** as a bare directory: move `settlements/`, `trade/` (post steps 6–7), `pathfinding/` (post step 5), `transport/` (post step 1) under `src/model/society/infrastructure/`. No `index.ts` at the `infrastructure/` level. Update every external importer (`pipelines/`, `genesis.worker.ts`, `src/ui`) to the new nested paths. Delete the now-empty top-level `settlements/`, `economy/`, `pathfinding/`, `transport/`.

9. **Assemble `geography/`** as a bare directory: move `tectonics/` and `terrain/` under `src/model/geography/`. No `index.ts` at the `geography/` level. Update every external importer. Delete the now-empty top-level `tectonics/`, `terrain/`.

10. **Merge `earth/` into `history/`**: move `earth/history/*` (reference/, import/, engine.ts, adapter.ts, fold.ts, checkpoint.ts, government.ts, color.ts, date.ts, dynasty-color-palette.ts, data-source.ts, organization-categories.ts, types.ts) directly to `src/model/history/earth/*` — flattening the redundant `history/` nesting and the merge into one move. Then move the current top-level `history/{index.ts,types.ts,derive/,eu4-days/,event-heap/,events/,fields/,history-rng/,snapshot/,state/,timeline/}` down into `src/model/history/generated/`. `history/` itself becomes a bare category dir with no `index.ts`/`types.ts`. Update every importer of both the old `HISTORY` namespace (`@/model/history` → `@/model/history/generated`) and the old `earth/` paths.

11. ~~Add `terrain/types.ts`, extracting `GenesisLandmarks` and any other inline cross-file types currently exported raw from `landmarks.ts` and siblings.~~ **Re-audited at execution time — premise is stale, like step 5.** `GenesisLandmarks` already lives in `geography/terrain/landmarks/types.ts` (not exported raw from an `index.ts`), and every other terrain sub-domain (`classification/`, `elevation/`, etc.) already keeps its types in its own `types.ts`, consumed by outside domains (`climate/`, `history/`, `pipelines/`, `society/`) via direct type-only imports from the concrete module — exactly the AGENTS.md pattern. No raw exported types found anywhere under `geography/`. No action needed.

12. **Audit `climate/types.ts` and `society/types.ts`** (the two remaining root-level `types.ts` files in bare category folders): for each exported type, confirm it's genuinely consumed by 2+ sub-domains (legitimate cross-cutting shape) vs. only ever consumed by one sub-domain's `index.ts` (rule-40 violation — should move into that sub-domain's own `types.ts` instead). Relocate single-consumer types accordingly.
   - **Executed.** `climate/types.ts`: relocated `GenesisHazards`→`geography/terrain/hazards/types.ts`, `GenesisVolcanism`+`GenesisHotspotExposureSummary`→`geography/terrain/volcanism/types.ts` (both were never actually consumed by any `climate/` sub-domain — misplaced tectonics/terrain concepts, not audit false-positives), `GenesisObservedDtr`+`GenesisObservedHumidity`→`climate/observed-earth/types.ts`, `PastaDebug`+`PastaClassificationBuffers`+`AssignPastaClimateParams`→`climate/pasta/types.ts`. Kept: `GenesisClimate`/`GenesisOceanCurrents`/`GenesisRainfall`/`GenesisHydrology` (genuinely consumed by 2+ climate sub-domains).
   - `society/types.ts`: relocated 8 nations-only param types → `nations/types.ts`, 4 population-only types (incl. `ProvincePopulation`) → `population/types.ts`, `EraConfig`→`eras/types.ts`, `SettlementEraTuning`→`settlement-tuning/types.ts` (new file), `GraphPartitionParams`→`graph-partition/types.ts`, `NationProfile`/`UrbanizationInputs`/`UrbanizationResult`→`urbanization/types.ts`, and `GenesisLocations`→`geography/terrain/locations/types.ts` (same "never consumed by society/" pattern as the climate misplacements). Kept: `GenesisProvinces`/`GenesisPartition`/`GenesisNationHierarchy`/`SocietyEra`/`GovernmentType`/`GovernmentFamily`/`CultureGenderSystem`/`LeaderGender` (genuinely cross-cutting).
   - Follow-up noted for whoever picks up `scripts/refactor/move-symbol.mjs` next: it can leave a stale non-type-only self-import behind when a destination file already imported the same symbol name from the old location, and it hardcodes `isTypeOnly: false` for imports it adds for locally-declared (not re-imported) dependencies — both had to be hand-fixed a few times during this step.

13. **Delete the dead `shared/types.ts`** (0 bytes).

14. **Move `shared/planet-code/` and `shared/slider-ranges/` into a new top-level `genesis-params/` domain** as `genesis-params/code/` and `genesis-params/ranges/`. Update `src/ui/planet/screen/generation/sliders.ts`, `src/ui/wiki/stats/star/star-stats.tsx`, and `src/model/pipelines/generate-default-world.smoke.test.ts`.

15. **Group the remaining `shared/` folders into bare category dirs**: move `dice/`, `rng/`, `seeds/`, `seed-label/`, `identity-seeds/` under `shared/random/`; move `color-interpolation/`, `color-palettes/` under `shared/color/`; move `math/`, `stats/`, `simplex-noise/` under `shared/math/` (careful: this reuses the folder name `math` at both levels — rename the leaf to `shared/math/core/` or similar to avoid the collision). No `index.ts` at any of the three category levels. Update every importer of the old flat paths (this is repo-wide — `shared/*` is imported from every domain).

---

## Out-of-scope violations (logged per AGENTS.md's "Rule violations" section)

Files over the ~250-500 line split threshold, left unsplit here to keep this pass focused on folder/domain-boundary and naming issues — each needs its own rule-40 split pass:

- `economy/trade-goods-table/index.ts` (4883 lines) — generated data asset, likely exempt from the split rule; confirm with the user before touching.
- `society/nations/index.ts` (1418)
- `economy/routes/index.ts` (1221) — addressed structurally by step 5 above (split into land/sea/network), but each resulting sub-file should still be checked against the 500-line threshold once split.
- `pipelines/import-heightmap/index.ts` (1135)
- `terrain/elevation/index.ts` (1052)
- `society/script/runegen/rune/index.ts` (1032) — newly discovered, not flagged in the prior version of this plan.
- `history/state/index.ts` (966)
- `pipelines/post-elevation/index.ts` (932)
- `climate/tidal-locked... / tidal-schedule/index.ts` (881)
- `climate/ocean-currents/index.ts` (843)
- `climate/pasta/index.ts` (828)
- `terrain/erosion/index.ts` (820)
- `society/language/languages/clusters/index.ts` (750)
- `pipelines/generate-world/index.ts` (741)
- `tectonics/plates/index.ts` (737)
- `genesis.worker.ts` (723) — orchestration file; likely exempt, confirm with user.
- `terrain/provinces/index.ts` (721)
- `climate/rain/index.ts` (609)
- `society/language/languages/builder/consonants/index.ts` (597)
- `society/language/names/index.ts` (550)
- `terrain/hotspots/index.ts` (539)

The repo-wide function max-one-param cleanup (`plans/fix-model-max-params.md`) is separate in-progress work and out of scope here — do not fold its remaining diagnostics into this plan.

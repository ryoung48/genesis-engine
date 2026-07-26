# Idealized `src/model` Domain Hierarchy & Refactor Plan (excluding `celestial/`)

Scope: everything under `src/model` except `celestial/` (that subtree has its own plan: `plans/fix-celestial-namespace-shims.md`).

## Method

Read every domain's `index.ts` (or flat top file), sized every non-test `.ts` file, and cross-checked against `celestial`'s existing plans for precedent.

**Headline finding, applicable to almost every domain in scope:** unlike `celestial` (which has real namespace objects — `PLANET`, `SYSTEM`, `STAR`, `MOON`, `ORBIT_BODY` — with violations confined to *sub*-folders), **every domain outside `celestial` has zero namespace objects at the top level.** `climate/index.ts`, `society/index.ts`, `economy/index.ts`, `tectonics/index.ts`, `terrain/index.ts`, `transport/index.ts`, `earth/index.ts`, `settlements/index.ts`, `pathfinding` (no barrel at all) all re-export bare free functions/constants — pure pass-through shims per AGENTS.md's "barrel is not a pass-through" rule. `history/index.ts` is the partial exception: it *does* define real logic (`initHistory`, `simulateUntil`) but still as free functions, not a `HISTORY` namespace. This is a repo-wide violation, an order of magnitude bigger than the celestial one. Given its size, it's scoped as a **separate follow-on plan** (see "Out-of-scope violations" below) rather than folded into every step — but every step below still produces domain boundaries a future namespace-wrapping pass can slot into cleanly.

---

## Part 1 — Idealized target hierarchy

```
src/model/
├── mesh/                          # SphereMesh construction — MESH
│   ├── index.ts                   #   (promote flat mesh.ts into a real submodule per rule 39)
│   └── types.ts                   #   SphereMesh (moved from types/mesh.ts)
│
├── world.ts                       # GenesisWorld assembly type — stays flat, single type, no sub-domain
├── genesis.worker.ts              # webworker entry point — orchestration, not a domain
│
├── types/                         # DELETED as a folder. See Part 2 step 1 for where each type moves.
│
├── shared/                        # UTILITIES layer (rule 41) — legitimate category, not a domain
│   ├── math.ts, array-ish helpers, text.ts, units.ts, time.ts, rng.ts, seeds.ts,
│   │   seed-label.ts, identity-seeds.ts, planet-code.ts, min-heap.ts, urquhart.ts,
│   │   simplex-noise.ts, stats.ts, color-interpolation.ts, color-palettes.ts,
│   │   slider-ranges.ts, dice.ts
│   └── index.ts                   # plain re-export barrel of free utility functions — correct as-is
│
├── geography/                     # GEOGRAPHY — new parent grouping the physical-planet-surface sub-domains (tectonics feeds terrain; neither stands alone as a top-level category, both model the same physical surface)
│   ├── index.ts / types.ts        #   thin delegating entry point over its two sub-domains — no top-level logic of its own
│   ├── tectonics/                 #   TECTONICS — plate generation/classification (moved from src/model/tectonics/)
│   │   ├── index.ts / types.ts
│   │   ├── coarse-plates.ts, plates.ts, collision.ts, mantle.ts, super-plates.ts,
│   │   │   synthetic-plates.ts, terrain-features.ts
│   └── terrain/                   #   TERRAIN — elevation/hydrology/settlement-siting surface (moved from src/model/terrain/)
│       ├── index.ts / types.ts    #   currently no types.ts — extract (see Part 2)
│       ├── elevation.ts (1007), erosion.ts (803), provinces.ts (782), hotspots.ts (563)
│       │   — flagged for future 250-500-line split (out of immediate scope, logged)
│       ├── rivers.ts, lakes.ts, craters.ts, volcanism.ts, hazards.ts, sea-level.ts,
│       │   locations.ts, landmarks.ts, classification.ts, coast-density.ts
│
├── climate/                       # CLIMATE — split into real sub-domains once files exceed threshold
│   ├── index.ts / types.ts        #   entry point delegates to sub-domain namespaces (rule 40)
│   ├── ebm/                       #   EBM — already correctly split — model sub-domain
│   ├── tidal-locked/              #   renamed from `locked/` — tidally-locked-planet climate variant
│   ├── wind/                      #   WIND (from wind.ts, 583 lines)
│   ├── rain/                      #   RAIN (from rain.ts 628 + rain-shared.ts 107)
│   ├── ocean-currents/            #   OCEAN_CURRENTS (from ocean-currents.ts 859 + ocean-currents-shared.ts 53)
│   ├── pasta/                     #   PASTA classification (from pasta.ts 838)
│   ├── tides/                     #   TIDES (from tidal-schedule.ts 946 + tidal-map.ts + tidal-force.ts + tides.ts)
│   ├── koppen.ts, vegetation.ts, humidity.ts, hydrology.ts, ice.ts, cyclones.ts,
│   │   tornadoes.ts, dtr.ts, apparent-temp.ts, observed-earth.ts, elevation.ts,
│   │   temperature-shared.ts, climate.ts (stay flat — all under threshold)
│
├── society/                       # SOCIETY — culture/demography/political layer
│   ├── index.ts / types.ts
│   ├── language/                  #   LANGUAGE — promote to real submodule with types.ts
│   │   └── languages/             #   LANGUAGES (existing, good structure)
│   ├── script/                    #   SCRIPT (existing structure, keep)
│   ├── nations/                   #   NATIONS (from nations.ts, 1403 lines)
│   ├── population/                #   POPULATION (from population.ts, 531 lines)
│   ├── eras/                      #   ERAS (from eras.ts, 471 lines)
│   ├── religion.ts, culture.ts, heritage.ts, urbanization.ts, hierarchy.ts,
│   │   timezone.ts, water-access.ts, gender-system.ts, settlement-tuning.ts (stay flat)
│   ├── graph-partition/           #   renamed from shared.ts — computeGraphPartition is core logic, not a utility
│   └── infrastructure/            #   INFRASTRUCTURE — new parent grouping the "how people/goods move and settle" sub-domains, none of which stood on its own as a top-level domain
│       ├── index.ts / types.ts    #   thin delegating entry point over its five sub-domains — no top-level logic of its own
│       ├── settlements/           #   SETTLEMENTS (moved from src/model/settlements/) — settlement region computation
│       ├── trade/                 #   TRADE — renamed from economy/ (trade-goods.ts + trade-goods-table.ts as a data asset)
│       │   ├── index.ts / types.ts
│       │   ├── trade-goods.ts
│       │   └── data/              #     trade-goods-table.ts (4892 lines) — generated data asset, not logic
│       ├── routing/                #   ROUTING — extracted from economy/routes.ts (1308 lines), split by sub-phase
│       │   ├── land/, sea/, network/  #   matches routes.ts's existing internal function grouping
│       ├── pathfinding/           #   PATHFINDING (moved from src/model/pathfinding/) — add missing index.ts barrel
│       └── transport/             #   TRANSPORT (moved from src/model/transport/) — route-network domain proper only (Route/RouteEdge/ROUTE_*)
│
├── history/                       # HISTORY — two sub-domains sharing the "history" concept, split by data source
│   ├── index.ts / types.ts        #   thin delegating entry point only — no top-level logic of its own
│   ├── procedural/                #   PROCEDURAL — simulated in-world event/political-history engine (renamed from flat history/ root)
│   │   ├── index.ts / types.ts
│   │   ├── events/                #   EVENTS — already a real sub-domain, keep
│   │   ├── event-heap.ts, fields.ts, state.ts (1004 — flagged for split), snapshot.ts,
│   │   │   derive.ts, timeline.ts, history-rng.ts, eu4-days.ts
│   └── earth/                     #   EARTH — real-world Earth reference data + EU4-derived history import (moved from src/model/earth/history/, absorbing the near-empty src/model/earth/ wrapper)
│       ├── index.ts / types.ts
│       ├── reference/, import/    #   real sub-domains, keep
│       ├── engine.ts, adapter.ts, fold.ts, checkpoint.ts, government.ts, color.ts,
│       │   date.ts, dynasty-color-palette.ts, data-source.ts, organization-categories.ts,
│       │   types.ts (stay flat)
│
├── worker-protocol/                # NEW domain — genesis.worker.ts's message contract, out of transport/worker-types.ts
└── pipelines/                     # NOT a domain — orchestration/entry-point scripts, stays flat
    ├── generate-world.ts, import-heightmap.ts, post-elevation.ts, derive-province-society.ts
    └── node-png.ts                #   MISPLACED — move to shared/ (generic PNG decoding utility)
```

### Notes on `types/` fate
The four files in `src/model/types/` (`climate.ts`, `society.ts`, `tectonics.ts`, `mesh.ts`) are not a legitimate shared types layer — each is a single domain's cross-domain-visible output types dumped in a generic folder instead of that domain's own `types.ts`. Each type moves to its owning domain (Part 2 step 1), except `GenesisParams`/`StageTiming` which are genuinely cross-cutting pipeline-stage types and move to `world.ts` instead.

---

## Part 2 — Ordered refactor plan

Each step is independently landable and typecheck/lint-clean.

1. **Dissolve `src/model/types/`, relocate each type to its owning domain's `types.ts`.**
   - `types/mesh.ts` → `mesh/types.ts` (after promoting flat `mesh.ts` to `mesh/{index.ts,types.ts}`).
   - `types/tectonics.ts`: `TectonicPlate`, `PlateVec`, `BoundaryInfo`, `CollisionResult`, `SuperPlateData`, `GenesisTerrainFeatures` → `tectonics/types.ts`; `GenesisParams`/`StageTiming` (genuinely cross-cutting) → `world.ts`.
   - `types/climate.ts` (`GenesisClimate`, `GenesisOceanCurrents`, `GenesisHazards`, `GenesisHydrology`, `GenesisObservedDtr`, `GenesisObservedHumidity`, `GenesisRainfall`, `GenesisVolcanism`) → merge into `climate/types.ts`.
   - `types/society.ts`: `GenesisProvinces`, `GenesisLocations`, `GenesisRivers`, `GenesisPartition` → `terrain/types.ts`; `GenesisNationHierarchy` → `society/types.ts`.
   - Update `model/index.ts` and `model/world.ts` imports. Delete `src/model/types/` entirely.

2. **Split `climate/` into real sub-domains** for the five oversized files, each promoted to `<name>/{index.ts,types.ts}`:
   - `ocean-currents.ts` (859) + `ocean-currents-shared.ts` (53) → `climate/ocean-currents/`.
   - `pasta.ts` (838) → `climate/pasta/`.
   - `tidal-schedule.ts` (946) + `tidal-map.ts` (180) + `tidal-force.ts` (167) + `tides.ts` (26) → `climate/tides/`.
   - `rain.ts` (628) + `rain-shared.ts` (107) → `climate/rain/`.
   - `wind.ts` (583) → `climate/wind/`.
   - Extract each sub-domain's param/result types out of the merged `climate/types.ts` into its own `types.ts`.

3. **Rename and formalize `climate/locked/` → `climate/tidal-locked/`.** Give it a `types.ts` for currently-inline types; clarify via doc comment that it's the tidally-locked-planet variant of `wind`/`rain`/`ocean-currents`/`heat`.

4. **Split `economy/routes.ts` (1308 lines)** into `routing/land/`, `routing/sea/`, `routing/network/` matching its existing internal function grouping (final location is under `society/infrastructure/routing/` — see step 12). Extract inline param types (`RouteWorldInput`, `SearchWorkspace`, etc.) into each sub-folder's `types.ts`.

5. **Promote `society/shared.ts` → `society/graph-partition/{index.ts,types.ts}`.** `computeGraphPartition` is core partitioning logic reused by nations/locations, not a `shared/`-style utility. Move `GraphPartitionParams` into the new `types.ts`.

6. **Split `society/nations.ts` (1403), `society/population.ts` (531), `society/eras.ts` (471)** into `society/nations/`, `society/population/`, `society/eras/` with extracted `types.ts`. Promote `society/language/` to a full submodule matching `languages/`.

7. **Treat `economy/trade-goods-table.ts` (4892 lines) as a generated data asset**, not logic needing a rule-40 split. Move to `trade/data/trade-goods-table.ts` (final location under `society/infrastructure/trade/` — see step 12). Converting to `.json` is a follow-up (affects the `AUTO-GENERATED` regen script) — out of scope here.

8. **Extract `worker-protocol/` out of `transport/worker-types.ts`.** Move `GenesisWorkerRequest`, `GenesisWorkerResponse`, `SerializedGenesisWorld`, `SerializedHistoryFrame`, `SerializedNetwork`, `SerializedSphereMesh` to `src/model/worker-protocol/{index.ts,types.ts}`. `transport/` keeps only `Route`, `RouteEdge`, `ROUTE_LAND_MAJOR/MINOR/SEA`, `forEachEdge`, `networkCount`, `SerializedRouteKind`. Update `genesis.worker.ts` and importers. (Do this before step 13's move so the move only relocates the already-trimmed `transport/`.)

9. **Merge `earth/` into `history/` as a sibling sub-domain of the current history logic**, instead of just renaming to avoid the collision. `src/model/earth/` has no real content of its own beyond wrapping `earth/history/` (its `index.ts` is 38 lines), so:
   - Move `earth/history/*` → `history/earth/*` (reference/, import/, engine.ts, adapter.ts, fold.ts, checkpoint.ts, government.ts, color.ts, date.ts, dynasty-color-palette.ts, data-source.ts, organization-categories.ts, types.ts).
   - Move the current flat `history/*` root files (event-heap.ts, fields.ts, state.ts, snapshot.ts, derive.ts, timeline.ts, history-rng.ts, eu4-days.ts, events/, and the logic currently in `history/index.ts`) → `history/procedural/*`, so `procedural/` becomes a real sub-domain matching `earth/`'s shape.
   - Rewrite `history/index.ts` into a thin delegating entry point over `procedural/` and `earth/` — no top-level logic left directly in it (same rule already applied to `events/` as a sub-domain).
   - Delete `src/model/earth/` entirely.
   - Update the ~15 files under the old `earth/history/` and external importers (e.g. `transport/worker-types.ts` imports `HistoryNote` from `history/`, and all `procedural/`-only consumers need their import paths updated to the new nested location).

10. **Move `pipelines/node-png.ts` into `shared/`** (generic PNG decoding utility, not orchestration logic) — fit into `shared/index.ts`'s flat re-export style.

11. **Add a `pathfinding/index.ts` barrel.** `genesis.worker.ts` currently imports `./pathfinding/pathfind` directly — a barrel-only violation by omission. Add the barrel re-exporting `pathfind`, extract any inline types to `pathfinding/types.ts`.

12. **Assemble `geography/`.** `tectonics/` and `terrain/` both model the physical planet surface (tectonics' plate output directly feeds terrain's elevation/erosion) and neither is a grab-bag category on its own:
    - `src/model/tectonics/` → `src/model/geography/tectonics/` (unchanged internally).
    - `src/model/terrain/` → `src/model/geography/terrain/` (unchanged internally; still owes the terrain `types.ts` extraction and file splits logged under "Out-of-scope violations").
    - Write `geography/index.ts` as a thin delegating entry point over `tectonics/` and `terrain/` (same pattern as `history/index.ts` in step 9 and `society/infrastructure/index.ts` below).
    - Update every external importer of the old `tectonics/`/`terrain/` paths (`pipelines/`, `genesis.worker.ts`, `src/ui`) to the new nested paths.
    - Delete the now-empty top-level `tectonics/` and `terrain/` folders.

13. **Assemble `society/infrastructure/`.** With steps 4/7/8/11 done, move the now-cleaned-up pieces into the new parent domain:
    - `src/model/settlements/` → `src/model/society/infrastructure/settlements/`.
    - `src/model/economy/` → `src/model/society/infrastructure/trade/` (rename domain from ECONOMY to TRADE — `trade-goods.ts` + `trade/data/trade-goods-table.ts`).
    - The `routing/{land,sea,network}/` folders from step 4 → `src/model/society/infrastructure/routing/`.
    - `src/model/pathfinding/` → `src/model/society/infrastructure/pathfinding/`.
    - `src/model/transport/` → `src/model/society/infrastructure/transport/`.
    - Write `society/infrastructure/index.ts` as a thin delegating entry point over these five sub-domains (no top-level logic of its own, same pattern as `history/index.ts` in step 9).
    - Update every external importer of the old `economy/`, `settlements/`, `pathfinding/`, `transport/` paths (pipelines, `genesis.worker.ts`, `src/ui`) to the new nested paths.
    - Delete the now-empty top-level `economy/`, `settlements/`, `pathfinding/`, `transport/` folders.

14. **Run `pnpm lint` and `pnpm typecheck` after each of steps 1–13**, not just once at the end — steps 1, 8, 12, and 13 especially touch imports in `model/index.ts`, `world.ts`, and `genesis.worker.ts` that many domains transitively depend on.

---

## Out-of-scope violations (logged per AGENTS.md's "Rule violations" section)

- **Repo-wide missing namespace objects.** Every domain barrel outside `celestial/` (`climate`, `society`, `history`, `geography/tectonics`, `geography/terrain`, and the `society/infrastructure/` sub-domains once steps 12–13 land) exports free functions instead of an uppercase namespace object, violating "the barrel is the entry point, not a pass-through." This mirrors `plans/fix-celestial-namespace-shims.md` but at far greater surface area (every domain root, not just celestial sub-folders). Recommend a dedicated `plans/fix-domain-namespace-shims.md` covering: (a) wrap each domain's re-exported functions in its namespace object, (b) update every call site across `src/ui` and `src/model` from `computeX(...)` to `DOMAIN.computeX(...)`, (c) sequence domain-by-domain, smallest (`transport`, `pathfinding`, `settlements`) before largest (`society`, `climate`).
- **Large terrain/climate files near or over threshold even after step 2/4**: `geography/terrain/elevation.ts` (1007), `erosion.ts` (803), `provinces.ts` (782), `hotspots.ts` (563) — flagged for a follow-up terrain-wide split pass, not included here to keep this pass focused on folder/domain-boundary issues.
- **`history/procedural/state.ts` (1004 lines)** — likely mixes multiple sub-concerns (province state, leader/dynasty state, relations); flagged for a rule-40 split in a follow-up, since it's a hot path touched by every `history/procedural/events/*` file.
- **Missing `types.ts` in `geography/terrain/`** — no `types.ts` exists yet; types like `GenesisLandmarks` are exported directly from `landmarks.ts`. Once step 1 lands the moved types there, extracting the rest of terrain's inline types should happen in the same follow-up pass as the terrain file splits above.
- **`society/infrastructure/settlements/` may be too thin to justify a folder** (1-line `index.ts` wrapping a single file) — flagged for a judgment call, not decided here.
</content>

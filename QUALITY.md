# Orogen Quality Audit

Scope: `src/model/orogen/` — 40+ files, ~250K of simulation code.

## Performance

1. **`erosion.ts:431,530` — per-iteration full sort of land cells.** `landCells.sort((a,b)=>elev[b]-elev[a])` runs inside `erodeComposite`'s iteration loop (up to 20 hydraulic + 10 thermal iters). O(L log L × iters) for sorting. Elevations change only locally; a bucketed bin-sort or partial re-sort would cut meaningful time.
2. **`orogen.worker.ts:285-296` — O(P²) cycle check per frame.** `buildFrame` walks parent chain for every province with `steps > P` as guard. Use `sovereignCurrent` that `ensureHierarchyClean` already computes.
3. **`state.ts:287-294, 398-421` — linear scans over all P nations.** `getRulerRelation`/`getWarAllies` iterate `0..P` every call. Maintain a small index or derive from `nationAdjacency`.
4. **`state.ts:466-493 isProvinceConnectedToParent`** uses `queue.shift()!` (O(n) per pop) + `Set<number>` visited. Swap to head-index pattern + `Uint8Array`.
5. **`pipeline.ts:134,149-152` — `seedToIdx` Map used once.** Replace with `Int32Array` indexed by seed id.
6. **`post-pipeline.ts:134,249` — `computeLandmarks` runs twice.** Only lake cells change; incremental update is cheaper.
7. **`elevation.ts:218-228` — stressVals JS array + sort for percentile.** Use `Float32Array` + nth_element pattern.
8. **`climate/climate.ts:399-436, 631-663` — SST/temperature noise loops duplicated** across tidal and non-tidal paths. Share a helper.
9. **`orogen.worker.ts:404-613, 616-812` — serializeWorld / buildTransferList ~400 lines of identity copy.** Schema-driven replacement would remove ~300 lines.

## Maintainability

10. **`pipeline.ts` is 700 lines with mixed responsibilities**: timing plumbing, progress callbacks, active/stagnant branching, small ocean flood-fill, lake classification, serialization-prep. Factor active vs. stagnant paths into separate functions with a common intermediate shape.
11. **`pipeline.ts:569-573` — dead code.** Comment-only `for` loop. Remove.
12. **`pipeline.ts:276-278, 326-328` — peak compression duplicated.** Lift into a helper.
13. **`elevation.ts:246-396` — six near-identical bounded BFS blocks** (rift, pull-apart, ridge, fracture, back-arc, coast). A `boundedBfs(mesh, seeds, halfWidth, pred)` helper would collapse ~150 lines.
14. **`erosion.ts:273-321, 674-719, 724-771` — `smoothElevation`, `sharpenRidges`, `applySoilCreep`** are three copies of the same outer-iteration pattern. Extract a `diffuseIteration` helper.
15. **`orogen.worker.ts:63-113 cloneHistorySeedWorld`** duplicates the field list from `serializeWorld`/`buildTransferList`.
16. **`pipeline.ts:38-47` — inline `import("./types").TectonicPlate` etc.** Move to top-level `import type`.
17. **`features.ts` has two feature flags both set to `true` with no off-path code.** Delete or document.
18. **`orogen.worker.ts:28 WORKER_DEBUG_BUILD = "cycle-debug-2026-04-12-1"`** — committed debug marker. Remove or guard.
19. **Timing plumbing is ad hoc.** Each stage has its own `console.time` + `performance.now()` + push. A `withTiming(label, timings, fn)` wrapper would halve the noise.

## Readability

20. **`climate/climate.ts:278-473 computeTidalTemperature` is 200 lines with Legendre-polynomial derivation inline.** Extract helpers.
21. **`erosion.ts:364-410` — glacial precomputation uses `Float32Array | null` + non-null assertions** in the hot loop. Extract into own function.
22. **`rain.ts:172-181, terrain/rivers.ts:67-75` — IIFE fallbacks that synthesize `isLand` from elevation.** All callers now pass it; make required.
23. **Naming: `dBdry`, `nfbm`, `cnfbm`, `rnfbm`, `rIsLand`, `r_isOcean`** — mixed conventions. `r_` prefix is the convention.
24. **`types.ts` mixes five concerns in one file** (mesh, tectonics, climate, rainfall, partitions). Split by stage.

## Smaller Fixes

- `util/stats.ts:108 countContinents` — dual-rule `minCells`. Pick one rule, document.
- `post-pipeline.ts:207-211` — naive `dtr_annual` loop; fold into `computeDiurnalRange`.
- `state.ts:412-417 getWarAllies` — `validRels.includes` on per-iter array. Use `Uint8Array` bitmask.
- `orogen.worker.ts:811 Array.from(new Set(transfer))` — dedup at end; track during push instead.

## Recommended Priorities

1. Factor serialization (#9, #15) — biggest LOC reduction, lowest risk.
2. Extract bounded-BFS + diffusion helpers (#13, #14) — cuts ~300 lines.
3. Fix per-iteration sort in `erodeComposite` (#1) — real perf win.
4. Consume `sovereignCurrent` in `buildFrame` (#2) — removes O(P²).

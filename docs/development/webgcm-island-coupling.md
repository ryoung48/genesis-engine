# Geodesic atmosphere and native island surfaces: experiment

This experiment tests whether a geodesic atmosphere can exchange area-averaged scalar fields with Chaos Machine's original cell polygons while retaining small islands. It does not change the running WebGCM app or enable a coupled hybrid GCM.

## What was tested

`scripts/webgcm-islands/overlap.mjs` intersects the existing native spherical polygons with WebGCM's actual relaxed geodesic polygons. Native polygons are integrated as signed spherical triangle fans, including subtractive pieces when needed; each triangle is clipped against the convex geodesic cell's great-circle half-planes. The resulting sparse matrix contains overlap areas and original source/target indices. Neither the native mesh nor its land mask is rewritten.

For overlap area `A(i,j)`, native polygon area `A(i)` and geodesic polygon area `A(j)`:

- Atmospheric scalar sampled onto native cell `i`: `sum_j A(i,j) * value(j) / A(i)`.
- Native surface flux aggregated onto geodesic cell `j`: `sum_i A(i,j) * flux(i) / A(j)`.
- Geodesic land fraction: the same surface aggregation applied to the original binary native land mask.

The mapping checks coverage of every cell in both grids. Land labels stay on the native cells; fractional area is retained even where a geodesic cell is mostly ocean. Remapping a varying field back and forth is smoothing and is not an exact inverse. Preserving IDs and labels does not imply preserving all spatial detail in atmospheric fields.

`columns.mjs` also calls the installed WebGCM `createLandSurface`, `update` and `deposit` routines on the native land cells, including a manufactured isolated island. This is a controlled bookkeeping test: fixed 290 K air, 100 W/m² net surface heating, 1 kg/m²/day rain, zero evaporation, 600 s steps for one day, and vegetation disabled. The land heat capacity is the existing routine's default `1e6 J/m²/K`. Expected warming is therefore 8.64 K, and expected retained water is 1 kg/m². These are manufactured inputs, not predictions of island climate.

The net heating is also aggregated to verify its area integral. It is **not** injected into an atmosphere as a heat source: a coupled implementation must separately handle radiation, sensible heat and latent heat with the correct signs and avoid double-counting surface heating.

## Results

Two cached procedural worlds were checked at N=8, N=16 and N=32. The binary baseline classifies geodesic cells as land when their exact land fraction exceeds 0.5, then assigns each native cell the label of its largest-overlap geodesic cell. This isolates loss caused by a coarse binary label; it is not a benchmark of the existing raster loader.

| Native cells | GCM N | GCM cells | Original land cells relabeled water by binary baseline | Land cells without coverage/finite atmospheric sample in hybrid |
|---:|---:|---:|---:|---:|
| 3,001 | 8 | 642 | 129 | 0 |
| 3,001 | 16 | 2,562 | 55 | 0 |
| 3,001 | 32 | 10,242 | 4 | 0 |
| 10,001 | 8 | 642 | 390 | 0 |
| 10,001 | 16 | 2,562 | 267 | 0 |
| 10,001 | 32 | 10,242 | 73 | 0 |

All source IDs, coordinates and masks remained unchanged. Global land-area relative errors were below `2e-15`; maximum individual polygon coverage error was below `7e-13`. The controlled column tests matched their expected heating and water storage within floating-point roundoff.

In the 10,001-cell world, the binary baseline lost all cells of 16 small connected islands at N=32. Here “small” means a connected land component smaller than the mean geodesic cell area at that N. The manufactured one-cell island was 365.3 km² and occupied at most 0.732% of an N=32 geodesic cell. The binary classification erased it everywhere, while fractional mapping retained its full area and its separate native land column. At the test's manufactured 100 W/m² surface heating, its largest area-averaged coarse contribution was 0.732 W/m², rather than treating a whole GCM cell as land.

The first mapping runs took approximately 0.2–2 s on the 3,001-cell world and 0.5–5.8 s on the 10,001-cell world, depending on N. These are single local observations under concurrent repository work, not controlled performance benchmarks. The prototype scans all source/target cell pairs with spherical-cap rejection. Default-size world performance has not been measured and needs a spatial candidate index before assuming similar startup latency.

## Reproduce

```powershell
node --test scripts/webgcm-islands/overlap.test.mjs
node scripts/webgcm-islands/run.mjs <world.gcmworld-or-cached-world.bin>
```

The five checks cover coverage across the sphere, single-cell island preservation, conservation of an arbitrary signed surface flux, the installed land physics under prescribed forcing, and isolated cells near the poles/date line.

The runner writes reports and experimental `.gcmmap` packets under `stats/climate/<timestamp>-geodesic-islands/`. Packets contain overlap areas, indices, grid areas and the original land mask. They are experiment artifacts; no production loader consumes them.

Saved reports for these runs:

- `stats/climate/2026-10-19T02-09-21.171Z-geodesic-islands/report.json`: 3,001 native cells, original cache `82eabaa3139648cd-3d83300a08978fc7.bin`.
- `stats/climate/2026-10-19T02-10-10.211Z-geodesic-islands/report.json`: 10,001 native cells, original cache `bd95e6a6ccf438eb-3d83300a08978fc7.bin`.

## What remains

The experiment establishes the geometric mapping and controlled land-column bookkeeping. It does not establish a stable two-way coupled GCM or realistic island weather. The next implementation would sample actual atmospheric forcing, evolve native land and ocean surface tiles, and replace the corresponding coarse surface exchanges with conservative aggregated radiation, sensible-heat and moisture fluxes. WebGCM's present binary land/ocean physics cannot gain this behavior merely by receiving a fractional-mask array.

The coarse atmosphere will still lack resolved island sea breezes, mountain wakes and narrow rain shadows. Preserving a small island's land-surface state is useful, but it does not create atmospheric resolution below the GCM cell size.

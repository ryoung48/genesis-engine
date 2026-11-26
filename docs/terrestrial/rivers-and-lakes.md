# Rivers and lakes

Scope: terrain generation.

Rivers route runoff across the land mesh; lakes fill the depressions that routing finds. Procedural worlds also hold terminal salt lakes and pans in basins whose evaporation outruns their inflow. Earth imports keep their imported lakes and have no lake kinds.

Code: `src/model/geography/terrain/{drainage,rivers,endorheic,lakes}`, constants in `groundwater-config` ([groundwater overview](groundwater/overview.md)).

## Routing

`DRAINAGE.order({ mesh, elevation, isLand, sinks })` runs a priority flood from the sea. It returns each land region's `drainTarget` (the neighbour it drains to), the processing order, and `waterLevel`, the level the flood filled each region to. A region whose `waterLevel` is above its ground sits in a depression. `sinks` marks land regions that are drainage roots with no target; rivers pass none on their first flood and the floors of the terminal basins on their second, and groundwater passes the pans.

Rivers build `basinId` first: connected land regions with `waterLevel > elevation` share an id. Monthly discharge then accumulates down the drain order from each region's own runoff (rain minus actual evapotranspiration, boosted with elevation), less a small pass-through loss that grows with PET and shrinks with discharge.

## Open basins

A basin that is not terminal is handled as before. Basins whose mean rain is under 250 mm a year hold no lake. Otherwise a lake of `ceil(inflow / 1200 mm)` regions is grown over the basin's low ground (`selectConnectedLakeCells`) and its cells become water (`isLand` 0) at one surface level. Every such lake has `lakeKind` 1, fresh. Lake cells that were emerged land above sea level stay land.

## Terminal basins

Water leaves a basin by its outlets: the basin regions whose `drainTarget` is outside the basin. The basin is terminal when annual inflow `Q` at its outlets is below the evaporation a full lake would lose:

```
E = Σ over basin regions  A · max(0, 1.2 · PET − rain) / 1000 / secondsPerYear     (m³/s)
terminal  ⇔  Q < E
```

`PET` and `rain` are annual sums, `A` the region area. The factor 1.2 is `LAKE_EVAP_SHARE`: open water evaporates more than a reference surface. A basin whose inflow equals `E` is open. Rain on the lake is netted in `E` and also counted in `Q` through the basin's own runoff; the double count is small.

A terminal outlet passes nothing on. That lowers the flow the downstream basins see, so one verdict can change another. Rivers therefore repeat accumulation with the current mask of terminal outlets, run the verdict on every basin, and add the newly terminal ones until no basin is added. A pass can only lower downstream inflow, so a terminal basin never reopens and the loop ends after at most one pass per basin in a chain.

The first priority flood drains every depression over its rim, so inside a terminal basin it still points toward the outlet. When any basin is terminal, rivers run the flood a second time with each terminal basin's lowest region as a sink and accumulate once more. Flow then ends at the basin floor instead of crossing the basin and climbing to the rim. `basinId`, `waterLevel`, the verdicts and `basinInflow` keep their first-flood values; discharge, drawn rivers and the `terminal*` flags follow the second drain order. A drawn river follows that order to the floor, so where a salt lake covers the floor the line runs through its water to the lowest region.

### Water bodies

For each terminal basin `ENDORHEIC.waterBodies` grows a candidate lake by priority growth: from the basin's lowest region, repeatedly add the lowest unselected basin neighbour (ties by region index), charging each region's `A · deficit` against `Q`, and stop before the budget is exceeded. A candidate of at least `SALT_MIN_REGIONS` (2) regions becomes a salt lake: `isLand` 0, one surface level, `lakeKind` 2. A smaller one is dropped.

The pan is the connected component containing the lowest region among basin regions at or below `z_min + PAN_FLOOR_FRACTION · (sill − z_min)` (0.5, in the normalised elevation unit). Its non-lake regions get `lakeKind` 3, are marked land, and keep `waterLevel = elevation`, so a salt lake can sit inside a pan, and a basin too dry for a lake still has a pan at its lowest region. This is a basin-floor proxy, not a prediction of salt deposits; the diagnostic reports its area at floor fractions 0.25, 0.5 and 0.75.

## Lake kinds

`GenesisRivers.lakeKind`, one byte per region: 0 none, 1 fresh lake, 2 salt lake, 3 pan. Hover shows the kind. In the Topography classification map a flat pan (`CLASSIFICATION.isSaltFlat`) is painted white and hover calls it a salt flat; the model topography code stays flat, so nothing downstream sees a new class. Salt lakes keep the lake colour. The groundwater stage treats pans as drainage roots and salt lakes as sources of inland salt marsh.

## Constants

| Constant | Value | Source or reason |
|---|---|---|
| `LAKE_EVAP_SHARE` | 1.2 | Upstream; open-water evaporation is commonly 0.8 to 1.3 of a reference PET, so 1.2 sits in that band |
| `SALT_MIN_REGIONS` | 2 | Two regions at about 2,500 km² each are about 5,000 km², the Great Salt Lake's order |
| `PAN_FLOOR_FRACTION`, `PAN_DEPTH_M` | 0.5, 0.5 m | Choice: the lower half of the depression is a basin-relative floor proxy; upstream holds pan heads 0.5 m under the surface |
| open-basin `EVAP_RATE`, `DESERT_THRESHOLD` | 1200 mm, 250 mm | Existing |

## Measured

Three default worlds (seeds 14963991, 20251107, 77031; 204,000 regions) from `shares.diagnostic.smoke.test.ts`. Earth figures are for reading against and are not used in the model.

| Metric | Ours |
|---|---|
| Depressions | 581 to 745 |
| Terminal | 170 to 217 (26 to 37% of depressions) |
| Terminal basins with a salt lake / with only a pan | 17 to 20 / 150 to 197 |
| Salt lake regions and area | 64 to 205 regions, 0.15 to 0.51 million km² |
| Pan regions and area | 327 to 384 regions, 0.71 to 0.85 million km² |
| Land downstream of a terminal outlet | 2.8 to 3.7% |
| Pan area at floor fraction 0.25 / 0.5 / 0.75 | 0.45 to 0.54 / 0.68 to 0.76 / 0.99 to 1.2 million km² |
| Rivers stage, lakes stage | 0.55 to 0.61 s, 0.14 to 0.24 s |

Differences from the expectations. Terminal depressions are a minority of all depressions but more than a handful. The pan footprint is sensitive to the floor-fraction proxy: widening it from 0.5 to 0.75 raises pan area by about 45 to 60%, and on seed 77031 the largest single pan from 11 to 59 regions, so the 0.5 setting is a mid-point of a wide range, not a measurement. The rivers stage costs about 0.55 to 0.6 s, inside the 0.2 to 0.6 s estimate. The diagnostic does not record the number of accumulation rounds, the share of regions whose flow changed or the rivers shortened.

## Checks

`src/test/terminal-lakes/`: `balance` (the verdict and PET deficit), `water-body` (lake growth, pan floor, disconnected pockets), `routing` (a synthetic bowl on a sphere mesh: wet catchment open, dry terminal, flow below a terminal outlet drops, flow ending at a terminal floor, determinism, kinds in 0 to 3). `shares.diagnostic.smoke.test.ts` asserts nothing; run it with `$env:TERMINAL_LAKE_SHARES = '1'` to write `stats/terminal-lakes/<UTC timestamp>-shares/`.

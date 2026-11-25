# Rivers and lakes

Scope: terrain generation.

Rivers route runoff across the land mesh; lakes fill the depressions that routing finds. Procedural worlds also hold terminal salt lakes and pans in basins whose evaporation outruns their inflow. Earth imports keep their imported lakes and have no lake kinds.

Code: `src/model/geography/terrain/{drainage,rivers,endorheic,lakes}`, constants in `groundwater-config` ([groundwater overview](groundwater/overview.md)).

## Routing

`DRAINAGE.order({ mesh, elevation, isLand, sinks })` runs a priority flood from the sea. It returns each land region's `drainTarget` (the neighbour it drains to), the processing order, and `waterLevel`, the level the flood filled each region to. A region whose `waterLevel` is above its ground sits in a depression. `sinks` marks land regions that are drainage roots with no target; rivers pass none, groundwater passes the pans.

Rivers build `basinId` first: connected land regions with `waterLevel > elevation` share an id. Monthly discharge then accumulates down the drain order from each region's own runoff (rain minus actual evapotranspiration, boosted with elevation), less a small pass-through loss that grows with PET and shrinks with discharge. `drainTarget` is never changed, so visible-river tracing and the `terminal*` flags keep their meaning.

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
| Depressions | 562 to 736 |
| Terminal | 170 to 212 (26 to 38% of depressions) |
| Terminal basins with a salt lake / with only a pan | 18 to 20 / 151 to 194 |
| Salt lake regions and area | 125 to 480 regions, 0.31 to 1.2 million km² |
| Pan regions and area | 336 to 341 regions, 0.73 to 0.77 million km² |
| Land downstream of a terminal outlet | 2.8 to 3.7% |
| Pan area at floor fraction 0.25 / 0.5 / 0.75 | 0.45 to 0.53 / 0.73 to 0.77 / 1.1 to 1.7 million km² |
| Rivers stage, lakes stage | 0.55 to 0.61 s, 0.14 to 0.24 s |

Differences from the expectations. Terminal depressions are a minority of all depressions but more than a handful, and the largest salt lake of one seed (20251107) is about 1.2 million km² in total, several times the Caspian Sea, because that seed's driest depression has a large catchment. The pan footprint is sensitive to the floor-fraction proxy: widening it from 0.5 to 0.75 raises pan area by about 45 to 130%, and the largest single pan from 26 to 293 regions on that seed, so the 0.5 setting is a mid-point of a wide range, not a measurement. The rivers stage costs about 0.55 to 0.6 s, inside the 0.2 to 0.6 s estimate. The diagnostic does not record the number of accumulation rounds, the share of regions whose flow changed or the rivers shortened.

## Checks

`src/test/terminal-lakes/`: `balance` (the verdict and PET deficit), `water-body` (lake growth, pan floor, disconnected pockets), `routing` (a synthetic bowl on a sphere mesh: wet catchment open, dry terminal, flow below a terminal outlet drops, determinism, kinds in 0 to 3). `shares.diagnostic.smoke.test.ts` asserts nothing; run it with `$env:TERMINAL_LAKE_SHARES = '1'` to write `stats/terminal-lakes/<UTC timestamp>-shares/`.

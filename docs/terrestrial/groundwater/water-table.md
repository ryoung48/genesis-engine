# Water table, springs, oases and wells

Scope: terrain generation.

Per ice-free land region, the stage derives recharge, a capacity-limited lateral flux, a distribution of water-table depth, and the springs, oases and wells that follow. Notation: `A` region area (m²), `W = √A` (m), `P` and `E` annual rain and PET (mm), `z` height above sea level (m), `s` local slope, `ρ` half the range of neighbour heights (m), `q` annual mean river flow and `q_m` its monthly values (m³/s), `S` the existing smoothstep. A region is wet when `P / E ≥ BASE_WET`, dry otherwise.

Code: `src/model/geography/terrain/groundwater/{recharge,transmissivity,drain-level,focused-recharge,lateral-flux,water-table,springs,oases}`; constants in `groundwater-config`.

## Recharge

Hydrology's kernel returns `runoff_annual`, the sum over months of `max(0, rain − AET)`.

```
rechargeMm = runoff · (RECH_MIN + RECH_SPAN · S(PERM_RANGE, logK)) · (SOIL_BASE + (1 − SOIL_BASE) · infiltration)
             / (1 + s / SLOPE_HALF) · (1 − FROST_CUT · permafrost)
permafrost = S(−1, −8, mean temp)          R = rechargeMm / 1000 / secondsPerYear     (m/s)
```

Rock permeability `logK` (log10 m², Gleeson et al. 2011 classes) comes from a table by rock key. Limestone adds `KARST_LOGK · dissolving`, where `dissolving = S(500, 1400, rain) · S(−2, 8, mean temp)`: it dissolves where wet and not frozen.

## Transmissivity

```
T = (Ks · D + K0 · f) · frost         K0 = 10^logK · RHO_G_OVER_MU        f = max(EFOLD_MIN_M, EFOLD_M / (1 + EFOLD_SLOPE · s))
```

Soil carries the flow where the rock is tight, rock where it is open. The e-folding depth and the frost factor are Fan, Li and Miguez-Macho (2013): `frost` is 1 above −5 °C coldest month, `min(1, 1.5 + 0.1·T)` to −14 °C, then `max(0.05, 0.17 + 0.005·T)`.

## Drain level

`DRAINAGE.order` on the final land mask, with pans as `sinks`, gives the drain order and targets, so groundwater ends in lakes, seas and pans, never past a terminal rim. Incision `I = min(150, 2 + 0.25 · ρ)` m. Water regions hold their level (sea 0, lake `waterLevel`, pan `z − 0.5 m`). A wet region drains locally, `hd = z − I`; a dry region takes `hd = min(z − I, hd[target])`, walking from the outlets inward. A dry region's offset `Δ = (z − I) − hd ≥ 0` is how far its table sits below its local stream level.

## Focused recharge and the riparian band

Dry regions only. A river's channel loses water to the bed: `c_m = min(q_m, w(q_m) · W · K_BED)` per month, with channel width `w = 7.2 √q` (Andreadis, Schumann and Pavelsky 2013), `C` its annual mean. The band is the valley width `w_v = clamp(0.3, 30, 6 · √(q/1000)) km` over `W`, at most `F_V_MAX` of the region; its evaporative demand is `f_v · A · max(0, PET − P)`, and the supplied share is `min(1, C / demand)`. The sustained band is `f_v` times that share, with a table uniform in [0, 3 m]. Channel recharge stays outside the cascade (Scanlon et al. 2006: arid recharge is mostly focused beneath channels). A wet region's streams gain, so it has no losing band.

## Lateral flux cascade

One sweep in reverse drain order, carrying `Qin` (m³/s). Each region offers downstream `Qavail = Qin + REGIONAL_SHARE · R · A` and can pass at most Darcy's capacity

```
Cap = T · g · e         g = max(S_MIN, (z − z_target) / d)         e = d / √3      (edge width, exact on a hexagonal mesh)
Qout = min(Qavail, Cap)
```

`Qout` goes to the target's `Qin` when it is a land region, or is counted as discharge to a water body. Ice, pans and roots with no target have `Cap = 0`. Effective recharge `R_eff = R + (Qin − Qout) / A`; flux that cannot pass a region surfaces there, `Qem = max(0, Qin − Cap)`. A second carried array `Qkarst` holds the part of `Qin` that came from karst regions (exposed limestone only: the karst flag needs the limestone rock key and sediment-covered limestone does not count; the [karst map](../karst-and-caves.md) reuses this spring class for its activity). Water is conserved: recharge over land equals local retention plus discharge to water bodies.

It cannot climb or split across a divide, and it routes by the filled surface, not by head. Flat ground and tight rock have a small `Cap`, so most flat land keeps its water; the cascade matters in steep, permeable and karst country.

## Water table

On the hillslope the surface rises `Z = I` from stream to divide over half-spacing `L`, and the table is the Dupuit parabola with mound `M = R_eff · L² / (2T)`. The half-spacing is `L = max(100 m, min(L_nat, L_crit))`: natural `L_nat = 500 / density` m, with drainage density `0.3 · 10^(1.3 · dissect[rock])` km/km², damped on flat ground (`DENSITY_FLAT_MIN` 0.25 up to 1 across slopes 0.0005 to 0.01) and halved on glaciated ground; and streams densify until recharge is drained, `L_crit = √(T · Z / R_eff)`.

In scaled coordinates `u = x / L`, depth below the surface is `d(u) = M u² + (Z − 2M) u`; negative means seepage. The share of the hillslope within `d0` of the surface is the root `u₊ = (2M − Z + √((Z − 2M)² + 4 M d0)) / (2M)` clamped to [0, 1], or `min(1, d0/Z)` when `M = 0`; with the dry offset, `d0 → d0 − Δ`. Mean depth is `Δ + ∫ max(0, d) du`, closed form. Shares within 0.25, 1, 3 and 30 m combine as a union of independent shares:

```
share(d0) = 1 − (1 − hill) · (1 − band) · (1 − shore)
band  = sustained share · min(1, d0 / 3 m)
shore = min(1, d0 / (max(s, S_SHORE) · W))      for a region touching the sea or a lake
```

Mean depth is the share-weighted mean, capped at `z + I`; the seepage share is `clamp(2 − Z/M, 0, 1)`. No solver, no iteration.

## Springs

One class per region, in this order: karst (`Qem ≥ SPRING_MIN_M3S` and `Qkarst / Qin ≥ KARST_SHARE`); piedmont (`Qem ≥ SPRING_MIN_M3S` in a dry region); contact (`Qem ≥ SPRING_MIN_M3S` otherwise, in practice a drop in `T` from permeable to tight rock, a slope break or a freeze); seepage (seepage share at least `SEEP_MIN` and slope at least `SPRING_SLOPE`, no lateral surfacing needed).

## Oases and wells

`WELL_REACH` is the share within `WELL_M` (30 m) of the surface. Well yield is `WELL_SHARE · (R_eff + channel recharge per area)` mm a year, so pumping stays under what arrives. In dry regions (`P/E < ARID_INDEX`) an oasis is classified in order (first match wins): river (sustained band at least `OASIS_MIN_SHARE` and `q ≥ RIVER_OASIS_M3S`); spring (`Qem / max(0, PET − P)` at least `SPRING_OASIS_M2`, the area the surfacing flux can keep wet); foothill (the same test with `Qem + Qfront`); fossil (a fossil-aquifer depression, below); wells (`WELL_REACH` at least `OASIS_MIN_SHARE`, and yield at least `WELL_MIN_MM`; or, on an aquifer key where the water is regional or fossil and does not depend on today's recharge, at least `SHALLOW_WELL_SHARE` of the region within `SHALLOW_WELL_M`). The kind is stored, so a region can hold an oasis with no spring class of its own: the spring class (seepage, contact, karst, piedmont) and the oasis kind (river, spring, foothill, fossil, wells) are separate layers. **Mountain-front supply** `Qfront`: each wet upland region (`P/E ≥ ARID_INDEX`) hands `REGIONAL_SHARE · R_eff · A` to its dry neighbours that lie at least `FRONT_DROP_M` lower, split equally between them. The cascade cap is a regional mean-gradient limit and passes about 0.5% of recharge, so almost nothing reaches desert interiors; foothill springs and foggara-fed oases are local and are not held to it. **Fossil-aquifer depression**: a dry region whose rock is an aquifer key (`AQUIFER_KEYS`: sandstone, limestone, young sediment, erg) and whose land neighbours are all active and average at least `DEPRESSION_M` above it is a fossil oasis whatever the modern recharge, since depression oases such as Siwa, Kharga and Dakhla are fed by regional and fossil aquifers that today's recharge does not explain. A pan alone is not an oasis. Springs and oases are drawn as approximate regional dots (see [overview](overview.md#map-modes)).

## Constants

Classes: **literature** (recalled, not checked against the paper), **choice** (no source, set here), **physics**, **upstream** (the World Orogen pull request at `66c3948`, whose own tuning we did not repeat). None is tuned on Earth; `REGIONAL_SHARE` is the one with no physical anchor beyond a wide range.

| Constant | Value | Class and reason |
|---|---|---|
| `LOG_K` per key | young −12.5, river/loess/till −13, dune sand −11.5, sandstone −12.5, shale −16.5, limestone −13.2, salt −18, basalt −12.5, volcanic −13.5, granite and gneiss −14.1, slate −14.5, shield −14.3, greenstone and ophiolite −14.5 | Literature: Gleeson et al. 2011 classes; dune sand added here |
| `KARST_LOGK`, `KARST_SHARE` | 2.2, 0.5 | Choice |
| `SOLUBLE_RAIN_MM`, `SOLUBLE_TEMP_C` | [500, 1400], [−2, 8] | Upstream |
| `DENSITY_*`, `DISSECT` | see config | Upstream; 0.3 to 4 km/km² spans the usual drainage-density range |
| `L_FLOOR_M` | 100 | Choice within hillslope lengths of 10² to 10³ m (Montgomery and Dietrich 1992) |
| `RECH_MIN`, `RECH_SPAN`, `PERM_RANGE`, `SOIL_BASE`, `SLOPE_HALF`, `FROST_CUT` | 0.1, 0.8, [−16.5, −11.5], 0.4, 0.1, 0.5 | Choice; Döll and Fiedler 2008 as the guide |
| `EFOLD_M`, `EFOLD_SLOPE`, `EFOLD_MIN_M` | 120, 150, 5 | Literature: Fan et al. 2013 |
| `RHO_G_OVER_MU` | 1e7 | Physics: water at about 20 °C |
| `REGIONAL_SHARE` | 0.1 | Choice: low end of the 1 to 50% mountain-block range (Wilson and Guan 2004) |
| `SPRING_MIN_M3S` | 0.05 | Choice: inside 0.01 to 1 m³/s of oasis springs |
| `INCISION_MIN_M`, `INCISION_REL`, `INCISION_MAX_M` | 2, 0.25, 150 | Choice |
| `BASE_WET` | 0.65 | Choice |
| `HG_WIDTH_A` | 7.2 | Literature: Andreadis et al. 2013 |
| `K_BED` | 1.2e-6 m/s | Choice within arid stream-bed losses (Scanlon et al. 2006) |
| `RIP_M` | 3 | Choice |
| `FLOOD_WIDTH_KM`, `_MIN_KM`, `_MAX_KM`, `F_V_MAX` | 6, 0.3, 30, 0.8 | Choice (GFPLAIN as a guide) |
| `S_MIN` | 1e-4 | Choice: tidal flats and deltas slope 1e-4 to 1e-3 |
| `S_SHORE` | 1e-3 | Choice: the steep end of the 1e-4 to 1e-3 tidal-flat and delta range; at 1e-4 every flat coastal region was almost wholly wet and mangrove plus coastal salt marsh covered about 1.5 million km² (mangroves cover about 150,000 km² on Earth, from memory) |
| `WELL_M`, `WELL_SHARE`, `WELL_MIN_MM` | 30, 0.5, 5 | Choice (Bredehoeft 1997 on safe yield) |
| `ARID_INDEX` | 0.2 | Literature: UNEP 1992 |
| `OASIS_MIN_SHARE`, `RIVER_OASIS_M3S` | 0.02, 20 | Choice: 2% of a region is about the size of a large oasis |
| `SHALLOW_WELL_M`, `SHALLOW_WELL_SHARE` | 3 m, 0.1 | Choice: fossil wells need shallow, hand-diggable water over a tenth of the region (about 250 km²); the 30 m reach alone passed 55 to 75% of regions with at least half their area within 30 m and gave wells on a fifth of dry regions |
| `FRONT_DROP_M` | 300 m | Choice: the local relief of the lowest mountain class (UNEP-WCMC mountain classes, from memory) |
| `DEPRESSION_M`, `AQUIFER_KEYS` | 200 m, sandstone, limestone, young, erg | Choice: Saharan depression oases sit 100 to 300 m below their plateau (from memory); 100 m gave spring oases on 9 to 12% of dry regions, 200 m gives 4 to 7%; erg is sand over aquifers and is the commonest hyperarid rock |
| `SPRING_OASIS_M2` | 100,000 m² | Choice: 10 ha, a small spring garden (Saharan oasis hamlets irrigate tens of hectares); a 2% region share needed about 1.6 m³/s and gave no spring oases, and 25 ha gave 29 to 95 per seed |
| `SEEP_MIN`, `SPRING_SLOPE` | 0.02, 0.004 | Choice |

## Checks

`src/test/groundwater/`: `recharge`, `transmissivity`, `drain-level`, `focused-recharge`, `lateral-flux` (conservation, capacity, order independence), `water-table` (the closed form against numeric integration), `springs-oases`, and `world` (determinism on a generated world). `shares.diagnostic.smoke.test.ts` asserts nothing; run it with `$env:GROUNDWATER_SHARES = '1'` to write `stats/groundwater/<UTC timestamp>-shares/`.

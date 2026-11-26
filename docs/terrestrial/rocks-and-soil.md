# Rocks and soil

Scope: `:history`.

Every land region of a procedural world has a surface rock, one of 13 kinds, and a soil fertility between 0 and 1. Farming reads the fertility as a soil factor on its climate fit. Earth imports have neither; their soil factor is 1.

The rules are ported from World Orogen (`v2/js/geology/rocks.js`, `geology-config.js`, `finish/*`, `farming/farming-config.js`, commit `ed466f9db71292e912d8d0160e689a67a994f2d9`), fitted to our own crust record ([tectonics records](tectonics-record.md)) and erosion. See the README references.

## Kinds

| Code | Kind | Family |
|---|---|---|
| 0 | sea | none |
| 1 | young sediment | young |
| 2 | sandstone | sedimentary |
| 3 | shale | sedimentary |
| 4 | limestone | sedimentary |
| 5 | salt | sedimentary |
| 6 | basalt | volcanic |
| 7 | volcanic | volcanic |
| 8 | granite | plutonic |
| 9 | slate | metamorphic |
| 10 | gneiss | metamorphic |
| 11 | shield | metamorphic |
| 12 | greenstone | metamorphic |
| 13 | ophiolite | metamorphic |

Young sediment carries a tag in `youngKind`: `river` (1), `loess` (2), `till` (3) or `erg` (4, dune sand); every other region has tag 0.

## How a region's kind is chosen

`ROCKS.classify` (`src/model/geography/terrain/rocks`) runs as the stage `Post: rocks and soil`, after the Köppen map and before hazards, provinces and farming. It reads the crust record and geologic record (the old flood basalts) of the present-day tectonics, the final elevation, river discharge, the Köppen zones, the PASTA climate (for ice land), wind and mean temperature, and the erosion record; the soil step also reads the vegetation classes (for podzol). It writes no height, river or climate field.

1. **Basement** (`rocks/basement`): a score per cell for volcanic, basalt, granite, slate, gneiss, shield and ophiolite from the crust record (orogeny type and age, belt strength, exhumation, volcanic type and wear, suture flags, terranes). Greenstone is carved out of shield and gneiss in troughs of a dome noise. Basalt also comes from a lava cap: the present flood basalts' unworn thickness, and the record's old flood basalts (`GeologicRecord.oldLip`), whose footprint keeps `1 − OLD_LIP_WEAR_SHOWN · worn` of its cap.
2. **Cover** (`rocks/cover`): the sedimentary kind of the cover column. Shown cover is the record's cover thickness minus a strip for high ground and for ice; cover above `COVER_SHOW_KM` is limestone (carbonate share), salt (`SALT_SHARE` of the evaporite share), shale (clastic share times a shale share that rises with marine and organic facies) or sandstone.
3. **Glacial** (`rocks/glacial`): drift over land inside the past-ice extent but outside the present ice, till and outwash within `OUTWASH_KM` of that extent, and at moraines. The present ice is the erosion record's `glaciated` regions (`glacIdx` above `ICE_GLACIDX`, the index the fjord step reads, restricted to land); it strips cover and stays unchanged. The past-ice extent is `pastIce` (`glacIdx` above `ICE_PAST_GLACIDX`), a lower threshold read by till only, standing in for the ice ages' wider reach without a second ice model.
4. **River sediment** (`rocks/river-sediment`): plains are the top `PLAINS_SHARE` of land by the erosion step's sediment ledger, and floodplains line large rivers (discharge at least `FLOODPLAIN_Q[0]`, the largest rivers) on low ground relative to the channel.
5. **Loess** (`rocks/loess`): dust from deserts and outwash, carried upwind-to-downwind over the sim mesh, thickest near the source and zero on steep or hot land.
6. **Sand seas** (`rocks/sand-sea`): desert regions (Köppen BWh weight 1, BWk 0.8, BSh 0.1, BSk 0.05) that are flat (steepest neighbour slope under `SAND_SLOPE`) and lower than their surroundings (the 80 km neighbour average of land height minus the region's height, over `SAND_BELOW_KM`), averaged over about 40 km so a sand sea is one sea and not a speckle. Upstream also fills the sand sea's hollows and raises dunes; here the height is untouched and only the tag is kept.
7. **Assembly**: scores of the region's record cell and its sim neighbours are blended (a coastal region whose record cell is sea takes the basement and cover of an adjacent land cell; only regions with none are river sediment, or till on ice), patches come from seeded simplex noise, and the highest score wins. Young sediment takes `YOUNG_GAIN · max(river, erg, loess, till)` and records its tag. Ice land, meaning regions under the present ice (`glaciated`) or classed Ice (`CI`) by the PASTA climate, takes no river sediment and no loess, because dust and floodplains do not settle on permanent ice; it shows till or the scoured basement. Two passes of a majority filter then remove single-region speckle; young regions and ice land are exempt.

All noise seeds derive from the world seed with distinct salts, so a seed always gives the same map.

## Bedrock

`ROCKS.classify` also returns `bedrock`: the rock a young-sediment region would show without its young tag, the best-scoring kind other than young from the same score loop. It equals `rock` wherever rock is not young; a coastal region that falls back to river sediment or till has young bedrock. Nothing else reads the difference except [karst and caves](karst-and-caves.md), which uses it for carbonate and evaporite buried under sediment. Adding it left every other output unchanged.

## Erosion's side outputs

`EROSION.erodeComposite` returns an `ErosionRecord` (`sedimentElev`, `morainesElev`, `glaciated`, `pastIce`). The first two are ledgers in elevation units of what the hydraulic step deposited and what the glacial step left as moraine; `HEIGHT_SCALE.elevDeltaKm` converts them to km at the final height. Nothing in the record feeds back into the elevation arithmetic: the eroded heights are bit-identical to those from before the record existed, which `src/test/rocks-soil/erosion-record.smoke.test.ts` checks against a stored checksum.

## Soil

`SOILS.soilAt` (`src/model/geography/terrain/soils`) gives fertility from the parent material and the region's climate:

`fertility = parent · (1 − LEACH_LOSS · leach) · (1 − PODZOL_LOSS · podzol) · (1 + BLACK_BONUS · black)`, clamped to 0..1.

- **Parent**: the table below, by rock kind or young tag (young sediment with no tag counts as river).
- **Climate terms** from `SOILS.regionClimate`: `wet` is annual rainfall over the sum of monthly potential evapotranspiration (each month at least `PET_FLOOR` mm), `mean` the annual mean temperature, `warmest` and `coldest` the monthly extremes.
- **Black earth** rises with subhumid wetness, a warm summer and a cold winter. The plan's formula had the cold-winter ramp reversed against upstream; the upstream direction is used.
- **Leaching** rises with wetness and mean temperature, and is reduced by `LEACH_RENEW` where floods, ash or young basalt renew the ground (river plains, volcanic, basalt), and by `LEACH_RENEW.rising` times how active the region's mountain belt is (`rising` = live orogeny × belt strength from the crust record; upstream's `young`), since a rising range keeps exposing fresh rock.
- **Podzol** rises with cold winters and cool summers, and applies only where the vegetation class is woods or forest or denser (code ≥ 4). Upstream gates it on needleleaf share; the vegetation model has no leaf type, so this keeps podzol off tundra, cold grass and bare ground and leaves taiga, the cold forests where it forms, in.
- **Modifier**, stored per region as `soilModifier` (none, black, leached, podzol): leached at leach ≥ 0.45, else black at black ≥ 0.5, else podzol at podzol ≥ 0.5.
- **Words**, for display, upstream's: river silt, loess, glacial till, dune sand, volcanic ash, basalt clay, limestone soil, shale clay, sandy soil, thin granite soil (granite, gneiss and shield), stony slate soil, greenstone soil, serpentine soil and salt crust, with black earth, leached red earth and acid podzol for the modifiers (`SOILS.kindWord`, `SOILS.modifierWord`).
- **Grade**, for display: Barren, Poor, Middling, Good or Rich at the `SOIL_GRADES` edges.

## Farming soil factor

`FARMING_GROUND` multiplies the climate fit by `soil = clamp(fertility / SOIL_REF, 1 − SOIL_MAX_LOSS, 1)` (area-weighted per province) before the plough and terrace factors, so `cropFit` and `terraceFit` scale together. Average ground (0.5) loses nothing, and the factor never raises a share, because the farming start-year targets were set without a soil term. Without a fertility field the factor is 1.

## Constants

All live in `SURFACE_CONFIG` (`src/model/geography/terrain/surface-config`). Values come from upstream unless a deviation is listed.

| Constant | Value | Source or reason |
|---|---|---|
| `COVER_SHOW_KM` | 0.6 | Deviation from upstream's 0.05: at 0.05 granite, gneiss, shield and greenstone were about 10% of land and all crystalline and volcanic rock about 15%, against 26% of GLiM's mapped area (metamorphic 13%, plutonic 7%, volcanic 6%; 29% of its ice- and water-free area; see the Earth comparison below); at 0.3 all crystalline and volcanic rock was 22 to 24% and at 0.6 it is 26 to 29%. Each step lowers mean fertility by about 0.01 and raises the below-reference share by 1 to 2 points |
| `OLD_LIP_WEAR_SHOWN` | 0.5 | Added, not upstream. The record's old flood basalts are 0.3 to 2 million km² each and 2 to 5 per world, but most are marked 45 to 100% worn; reading `1 − worn` gave basalt 0.2 to 0.6% of land, and flood-basalt plateaus are resistant caprock that keeps its footprint when worn. At 0.5 basalt was 0.9 to 1.3% of land; with the present flood basalts raised to 2 to 6 per world ([volcanism.md](volcanism.md)) it is 1.4 to 2.1% (GLiM gives volcanic rock as a whole, 6%, and does not split out flood basalt in its abstract, so the basalt share is not checked) |
| `HIGH_STRIP_FROM_KM`, `HIGH_STRIP_PER_KM` | 1.5, 1 | Upstream: cover is shed from high ground |
| `GLACIAL_STRIP_KM` | 0.4 | Upstream: ice scours cover and exposes shield |
| `OUTWASH_KM`, `MORAINE_KM` | 60, 0.06 | Upstream finish-ice |
| `ICE_PAST_GLACIDX` | 0.06 | Added, not upstream (it models one ice extent from the glacial index; the plan excluded an ice age). Chosen by sweeping 0.12, 0.08 and 0.04 on seed 77031 against the plan's 3 to 10% till estimate: till 1.9%, 3.3% and 9.3% of land. At 0.06 till is 7.5 to 9.5% of land across the three seeds. It sets till only; heights and the glaciated mask do not depend on it |
| `CARB_GAIN` | 2.5 | Added, not upstream: multiplies the record's carbonate facies share before the limestone draw. GLiM puts carbonates at about a third of sediments (about 21% of its mapped area; see the Earth comparison) and limestone was 12 to 14% of land. The facies draw is smoothed noise, not uniform, and many columns are already fully carbonate, so the gain buys less than its face value: 1.5 gave 14 to 17%, 2.5 gives 18 to 21%. Shale and sandstone give up the difference |
| `SHALE_LAND`, `SHALE_MARINE`, `SHALE_MAX` | 0.85, 0.9, 0.9 | Deviation from upstream's 0.25, 0.55 (`SHALE_MAX` is upstream's). With upstream's values sandstone was 28 to 29% of land and shale 12 to 14%, against shale being the commonest sedimentary rock on Earth (roughly twice sandstone; not checked against a cited source). At 0.55 and 0.8 shale was 21 to 23% and sandstone 19 to 21%; at 0.7 and 0.9 shale was 21 to 22% and sandstone 13% (with `COVER_SHOW_KM` 0.6; 24 to 25% and 14 to 15% at 0.3), and with `CARB_GAIN` 2.5 shale was 15 to 17% and sandstone 12% (a ratio of 1.3 to 1.4), so `SHALE_LAND` was raised from 0.7 to 0.85: shale is 17 to 19% and sandstone 10 to 11%, a ratio of 1.6 to 1.7 |
| `TILL_SHOW` | [0.2, 0.7] | Upstream |
| `ALLUVIUM_KM` | [0.0001, 0.0004] | Deviation: the plan's floor blocked plains, because our ledger is smaller than upstream's routed bedload; rescaled to our ledger |
| `PLAINS_SHARE`, `PLAINS_BAND` | 0.06, 0.03 | Upstream |
| `FLOODPLAIN_Q` | [8000, 16000] | Deviation from upstream's [250, 1000]: our discharge field is much larger (14% of land is at or above 250 and 3.5% at or above 2000), so upstream's values flooded a third of land. Swept on seed 77031: [250, 1000] gave 30% river sediment, [1000, 4000] 19%, [2000, 8000] 16%, then 10% once coastal fringe regions stopped defaulting to river; [4000, 8000] gave 8.6% and [8000, 16000] 7.5% (plan estimate about 6%, of which plains are about 4%) |
| `FLOODPLAIN_KM`, `FLOODPLAIN_HAND_KM` | [6, 25, 60], [0.03, 0.1] | Upstream finish-sediment |
| `LOESS_KM`, `LOESS_REACH_KM`, `LOESS_STEPS` | 0.08, 600, 12 | Upstream finish-wind |
| `LOESS_SHOW` | [0.45, 0.95] | Deviation from [0.4, 0.9]: past-ice drift adds dust sources, and with the wider extent [0.4, 0.9] gave 9.1% loess and [0.3, 0.75] 11.7% (seed 77031, plan estimate 3 to 8%); [0.5, 1] gave 3.4 to 5.2% before ice land lost its loess and 2.9 to 4.3% after; [0.45, 0.95] gives 3.7 to 5.7% (till gives up about a point to it) |
| `DESPECKLE_PASSES`, `DESPECKLE_MIN_VOTES`, `DESPECKLE_SHARE` | 2, 3, 0.6 | Upstream `despeckle` |
| Parent fertility | river 1, loess 0.95, till 0.6, dune sand 0.05, sandstone 0.35, shale 0.65, limestone 0.7, salt 0.03, basalt 0.85, volcanic 0.9, granite 0.3, slate 0.45, gneiss 0.35, shield 0.3, greenstone 0.55, ophiolite 0.15 | Upstream `parent`; its gneiss and shield take the granite value |
| `BLACK_*`, `LEACH_*`, `PODZOL_*` | see the config; `LEACH_RENEW.rising` 0.5 | Upstream farming-config (`leachRenew.young` is the rising-range term) |
| `SAND_SLOPE`, `SAND_BELOW_KM`, `SAND_AROUND_KM`, `SAND_EXTENT_KM`, `SAND_EXTENT`, `ERG_SHOW`, `SAND_DESERT` | 0.006, 0.05, 80, 40, [0.08, 0.4], [0.25, 0.6], BWh 1 / BWk 0.8 / BSh 0.1 / BSk 0.05 | Upstream finish-wind (`ergSlope`, `ergBelowKm`, its 80 km and 40 km blurs and its desert weights) and geology-config (`ergShow`) |
| `SOIL_GRADES` | 0.12, 0.3, 0.5, 0.75 | Upstream farming-view legend |
| `SOIL_REF`, `SOIL_MAX_LOSS` | 0.5, 0.92 | Upstream `parent.unknown` and `slopeMaxLoss` |

## Map modes and hover

The Geography tray has a Geology button with modes Rock, Soil and (when the layers exist) Karst, switched in the Geology section of the overlay controls. Rock colours are upstream's `ROCK_INFO` colours, with young sediment's tags as variants. Soil runs from barren tan to rich green. It shows nutrient potential of the ground, not whether crops can grow: water is the climate fit's job, so desert ground keeps its parent value unless it is sand sea (desert mean fertility 0.43 to 0.46 with sand seas, about 0.52 before them) and irrigable desert alluvium reads as rich. Hover shows the rock kind (with the young tag) and the soil in upstream's words with its grade, fertility and modifier, for example "river silt, black earth · Rich 91%". The button is absent for Earth imports.

The detailed simulation report's `farming.ground` block carries the area-weighted mean soil factor (`soilMean`) and the percentage of settled provinces with a factor below 0.5 (`soilBelowHalfPercent`).

## Checks

`src/test/rocks-soil/` holds the smoke tests (`pnpm vitest run --project smoke src/test/rocks-soil`): erosion record, cover, glacial, river sediment, sand seas, soil formula, the farming factor, and a world-level file that generates one default world (about 35 s). `shares.diagnostic.smoke.test.ts` asserts nothing; run it with `$env:ROCK_SOIL_SHARES = '1'` (about 90 s, three worlds) to write `stats/rocks-soil/<UTC timestamp>-shares/report.md`.

Shares of land regions on seeds 14963991, 20251107 and 77031 (see the report for the full table):

| Metric | Ours |
|---|---|
| Young sediment | 23 to 26% (river 7.1 to 8.6%, loess 3.7 to 5.7%, till 7.4 to 8.6%, dune sand 2.7 to 4.3%) |
| Sedimentary, metamorphic, plutonic, volcanic | 47 to 49%, 15 to 18%, 6 to 7%, 4% |
| Sandstone, shale, limestone | 10 to 11%, 17 to 19%, 18 to 21% |
| Basalt | 1.4 to 2.1% |
| Glaciated | 1 to 3% |
| Fertility below `SOIL_REF` | 42 to 46% of land |
| Mean fertility, mean soil factor | 0.54 to 0.56, 0.82 to 0.84 |
| Rocks-and-soil stage | 0.7 to 0.8 s |

Earth comparison. GLiM (Hartmann and Moosdorf 2012, [PANGAEA](https://doi.pangaea.de/10.1594/PANGAEA.788537)) states in its dataset abstract that sediments cover 64% of the mapped area (a third of that carbonates), metamorphics 13%, plutonics 7%, volcanics 6% and water or ice 10%. The abstract gives no per-class areas and no denominator, so the table also shows each share renormalised to the 90% that is neither water nor ice (my reading, since the five numbers sum to 100). Our land regions include ice land (PASTA Ice and present-ice regions show till or basement), so the raw column is the fairer comparison for sediments and crystalline rock together. The per-class tables in the paper were not readable (the publisher refused the fetch); sandstone against shale is not checked against GLiM.

| Family | GLiM | GLiM, ice- and water-free | Ours |
|---|---|---|---|
| Sediments (young + sedimentary) | 64% | 71% | 71 to 74% |
| of which carbonate | about 21% | about 24% | limestone 18 to 21% |
| Metamorphic | 13% | 14% | 15 to 18% |
| Plutonic | 7% | 8% | 6 to 7% (granite and ophiolite) |
| Volcanic | 6% | 7% | 4.2 to 4.4% (andesite, rhyolite and basalt) |

The families match closely. Carbonate was about 8 points under (limestone 12 to 14%) until `CARB_GAIN` raised it; volcanic rock is still about 2 points under.

Differences from the plan's estimates: sedimentary rock is 47 to 49% of land against an estimated 30 to 45% (the crust record has 56 to 62% of land under cover, little of it shed; `COVER_SHOW_KM` was raised from 0.05 to 0.6 to expose more basement). Crystalline and volcanic rock together are now 26 to 29% of land, matching GLiM, but volcanic rock is about two points under GLiM's share (see the Earth comparison); basalt is 1.4 to 2.1%, and the present flood basalts were raised from 0 to 2 per world at chance 0.45 to 2 to 6 at 0.8 (this changes elevation, see [volcanism.md](volcanism.md)), many land at sea, and the record's old ones are mostly worn. The mean soil factor is 0.82 to 0.84, inside the estimated 0.8 to 0.9; it was 0.76 to 0.77 before the podzol vegetation gate (podzol applies only under woods or denser vegetation) and the shale retune, which moved about 12% of land from sandstone's 0.35 to shale's 0.65. Loess (3.7 to 5.7%) is under Earth's roughly 10% (not checked against a cited source). Till and total young sediment fall inside their estimates, and river is 7.1 to 8.6% against about 6%, after changes to the first version, which had river 28 to 32%, loess 0.6 to 2% and till 0.1 to 0.3%: coastal land regions whose record cell is sea no longer default to river sediment (8% of land on seed 77031), `FLOODPLAIN_Q` is scaled to our discharge, and till reads a wider past-ice extent. The share of land regions whose kind differs from every neighbour's is 3.5% after despeckle, against a planned 2%, and more passes do not lower it (3.2% after four more).

## Hydraulic soil

Soil fertility says how rich the ground is. How fast water moves through it, its texture, depth, conductivity and capacity, and the rock permeability behind it are a separate layer built on the same rock kinds and young-sediment tags by the groundwater stage; neither reads the other. See [hydraulic soil](groundwater/hydraulic-soil.md). The surface rock also gates where mineral deposits can sit; see the [deposits overview](deposits/overview.md).

## Not modelled

Lithology-driven relief, bed banding, dune relief and the filling of sand-sea hollows, an ice-age climate, routed bedload and deltas, per-crop soil demand, soil depth and salinity, and any recalibration of the farming start-year targets. Upstream's soil-region blur (`soilRegionKm`) is not ported: soil is per region.

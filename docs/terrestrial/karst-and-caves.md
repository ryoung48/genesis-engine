# Karst and caves

Scope: terrain generation.

Every land region of a procedural world gets a karst kind, a karst potential, an activity and a class, and a seeded sample of notable caves is placed on the map as dots with a passage length. The map reads like a regional cave map: the fill says what kind of cave country a region is, the dots say where the known caves are. Earth imports have none of it (it needs the rock, groundwater and shore layers).

Code: `src/model/geography/terrain/karst` (`KARST`), `caves` (`CAVES`, with one submodule per type: `SINKHOLE_CAVE`, `GROTTO_CAVE`, `LAVA_CAVE`, `SEA_CAVE`, `TALUS_CAVE`, `GLACIER_CAVE`), `karst-caves` (`KARST_CAVES`, the stage entry and the class rule), constants in `karst-config` and `cave-config`.

## Pipeline position

`Post: karst and caves` runs in `pipelines/post-elevation` after `Post: shoreline`, because it reads the rock and bedrock layers, the groundwater spring class, the shore label and open-water exposure, the hazards' volcano field, topography, the slope score, ice thickness and the monthly climate. It writes nothing back: rock, groundwater, shore and height are bit-identical with and without it, which `src/test/karst/world.smoke.test.ts` checks against stored checksums for seed 14963991. The world gains optional `karst` layers, `caveSites` and `karstStats`; the layers and sites go to the UI through the worker transfer list. `bedrock` stays in the model and is not transferred.

## Bedrock

`ROCKS.classify` also returns `bedrock`: the rock a young-sediment region would show without its young tag, taken from the same per-kind scores (the best kind other than young). Everywhere else `bedrock == rock`. Coastal regions that fall back to river sediment or till have no basement score, so their bedrock is young and they have no covered karst. The existing outputs are unchanged.

## Kind, potential and activity

Kind, for a land region that is not under ice (`glaciated` or ice thickness above 0):

| Kind | Rule |
|---|---|
| `carbonate` | surface rock is limestone |
| `coveredCarbonate` | young sediment over limestone bedrock |
| `evaporite` | surface salt, or young sediment over salt |
| `none` | anything else |

The water term `w` is a rain ramp over `CARBONATE_RAIN_MM` times groundwater's mean-temperature ramp (`solubleTempC`: not frozen) for carbonate kinds, and a rain ramp over `EVAP_RAIN_MM` for evaporite (salt dissolves with little water). Groundwater's own dissolution ramp starts at 500 mm, which is demanding for cave formation (a first version that reused it called about 60% of exposed carbonate relict), so karst has its own, wider rain range. Potential is `rockTerm · (RELICT_FLOOR + (1 − RELICT_FLOOR) · w)`, where `rockTerm` is 1, or `COVER_FACTOR` under sediment. The relict floor sits below the cave edge, so a dry or frozen region is absent: bare dry limestone has old, dead caves at best, and a covered, dry one has none worth mapping.

Activity: `spring` where groundwater classed a karst spring, otherwise `active` when `w` is at least `ACTIVE_WATER`, otherwise `relict`. Groundwater's own karst flag is exposed limestone only; covered carbonate does not feed its karst flux.

## Cave types and potential

Seven types, each with a potential from 0 to 1:

| Type | Potential |
|---|---|
| solution | the karst potential |
| sinkhole | exposed carbonate only; ramp of `w` over `SINK_WET` (large, stable sinkholes need wet, active karst) |
| grotto | exposed carbonate at a karst spring; the solution potential |
| lava | basalt; `OLD_BASALT_FLOOR` at zero volcanic hazard rising to 1 at the volcanic-sand activity of the shoreline stage (young flows hold intact tubes) |
| sea | cliff or rocky-shore label; ramp of open-face exposure over the shoreline exposure classes, rocky shore at `SEA_ROCKY_TERM` of a cliff |
| talus | mountains; ramp of the slope score over `TALUS_SLOPE`, zero on young sediment, `TALUS_SHALE` on shale |
| glacier | ice on mountain terrain only (ice sheets would give a dot per region); ramp of the warmest month over `MELT_C` (meltwater cuts the cave) |

## Class

One class per land region, first match wins:

1. `pseudo` if the lava potential reaches `CAVE_RANGE[0]`. Basalt country has caves, but not karst ones.
2. `none` if the kind is none.
3. `absent` if the karst potential is below `CAVE_RANGE[0]`: karst rock with too little of the formation condition.
4. Otherwise a length index `potential · (LENGTH_FLOOR + (1 − LENGTH_FLOOR) · ramp(LENGTH_SLOPE, slopeScore))`, `long` when at least `LONG_MIN`, else `short`. Flat karst never reads long however wet; relief and water together make long cave country.

The classes follow the legend of the Data Bayou "Map of Caves in the USA": short, long, pseudo, absent and no karst. Class is a length regime, not a depth.

## Sites

For each land region and type, a site exists when `u < SITE_SCALE · TYPE_WEIGHT[type] · ramp(CAVE_RANGE, potential)`, with `u` a seeded hash of (world seed, type, region): at most one site per type per region, sorted by region then type. Sites sit a fraction of the way from the region centre toward a random land neighbour (up to `LAND_OFFSET_MAX`), so a site is always nearer its own region centre than the neighbour's. Sea sites sit `SEA_OFFSET` of the way toward an open-water neighbour, so they lie on the coast.

Passage length in metres: solution and sinkhole sites in a `short` region draw `SHORT_MIN_M · (LONG_CUT_M / SHORT_MIN_M)^(u^SHORT_LEAN)` (30 to 300 m, median about 150 m); in a `long` region a Pareto tail `LONG_CUT_M / (1 − u)^(1 / LONG_ALPHA)` capped at `LONG_MAX_M` (300 m and up, median about 600 m). Grotto sites always draw the short range. Sinkhole, lava, sea, talus and glacier sites draw log-uniformly in `FIXED_PASSAGE_M`: a sinkhole is a shaft or chamber, not a passage network, so it does not use the solution regime. The numbers are a notional scale for the dot, not a survey.

## Constants

| Constant | Value | Source |
|---|---|---|
| `COVER_FACTOR` | 0.5 | Choice. Sediment cover slows dissolution without stopping it; covered karst is real but less developed |
| `RELICT_FLOOR` | 0.15 | Choice. Below `CAVE_RANGE[0]` (0.2), so dry exposed carbonate is absent for `w` below about 0.06; at 0.3 exposed karst could never be absent |
| `CARBONATE_RAIN_MM` | [250, 1000] | Choice. Karst caves form in semi-arid country (the Nullarbor at about 250 mm) and are fully developed by about 1,000 mm |
| `ACTIVE_WATER` | 0.5 | Choice. The midpoint of the ramp: about 625 mm at a warm mean |
| `EVAP_RAIN_MM` | [50, 300] | Choice. Salt dissolves at far lower rain than limestone |
| `LENGTH_FLOOR`, `LENGTH_SLOPE`, `LONG_MIN` | 0.4, [0.1, 0.3], 0.5 | Choice. Flat karst stays short, as the reference map shows Florida; the slope edges are in slope-score units |
| `CAVE_RANGE` | [0.2, 0.6] | Choice. A covered dry carbonate region is at most 0.15, an exposed wet one is at full strength from `w ≈ 0.43` |
| `SINK_WET` | [0.7, 1] | Choice. Sinkholes need wet, active karst; with the wider water ramp most active karst already passes 0.5 |
| `OLD_BASALT_FLOOR` | 0.4 | Choice. Old flood basalts mostly collapsed or filled, but at 0.25 only 0.1% of land had a lava dot while 1.4 to 2.1% of land read pseudo; 0.4 gives about 7% of basalt regions a dot |
| `SEA_ROCKY_TERM` | 0.6 | Choice. Hard rocky shores hold fewer sea caves than cliffs |
| `TALUS_SLOPE`, `TALUS_SHALE` | [0.3, 0.6], 0.5 | The classification's own mountain slope edges; shale weathers into fines |
| `MELT_C` | [-8, 0] | Choice. Glacier caves need melt in the warmest month |
| `SITE_SCALE` | 0.15 | Choice. First 0.4, then 0.3, both too dense on the map |
| `TYPE_WEIGHT` | solution, grotto, lava 1; sinkhole 0.4; sea 0.5; talus, glacier 0.25 | Choice. Notable caves are overwhelmingly solution caves; without weights glacier dots were 28 to 42% of all sites and talus 10 to 21%. A sinkhole at 1 was 30% of sites, two thirds as many as solution |
| `SEA_OFFSET`, `LAND_OFFSET_MAX` | 0.45, 0.5 | Choice. Keep a site inside or beside its own region |
| `SHORT_MIN_M`, `LONG_CUT_M`, `LONG_MAX_M`, `SHORT_LEAN`, `LONG_ALPHA` | 30, 300, 100,000, 0.5, 1 | Choice. A heavy-tailed length distribution with the longest passages near the order of the longest mapped caves (hundreds of km) capped lower |
| `FIXED_PASSAGE_M` | sinkhole 30 to 1,000; lava 100 to 10,000; sea 10 to 300; talus 20 to 500; glacier 20 to 1,000 | Choice. Typical ranges for each cave kind |

## Map mode and hover

The Geology section has a Karst mode beside Rock and Soil (hidden for Earth imports and worlds without the layers). It fills land by class with no legend. A Caves toggle in the same section (on by default) draws one dot per site, coloured by type: solution black, sinkhole orange, grotto green, lava magenta, sea blue, talus brown, glacier pale blue. Hover shows the class, the kind, the potential and the activity, then one row per site in the region with its type and length to two significant figures.

## Results

`src/test/karst/` holds unit tests for the kind, potential and activity rules, each cave type, the class rule and the sites, and a world-level file that generates a default world (about 80 s). `shares.diagnostic.smoke.test.ts` asserts nothing; run it with `$env:KARST_SHARES = '1'` (about 110 s, three worlds) to write `stats/karst/<UTC timestamp>-shares/report.md`.

Shares of land regions on seeds 14963991, 20251107 and 77031 (the report also has the kind by class and kind by activity cross-tabs):

| Metric | Ours |
|---|---|
| Kind: exposed carbonate, covered carbonate, evaporite | 16 to 18%, 2.3 to 2.7%, 0.7 to 1.1% |
| Class: none, absent, short, long, pseudo | 77 to 79%, 5.7 to 7.2%, 7.2 to 9.5%, 4.4 to 5.7%, 1.4 to 2.1% |
| Absent split: exposed carbonate, covered carbonate | 3.9 to 5.2%, 1.7 to 1.8% of land |
| Activity of karst regions: relict, active, spring | 9 to 11%, 7 to 9%, 1.7 to 2.0% of land |
| Share of sites by type: solution, sinkhole, grotto, lava, sea, talus, glacier | 51 to 57%, 13 to 15%, 7 to 9%, 3 to 5%, 8 to 11%, 6 to 11%, 2 to 5% |
| Notable sites per 100 land regions | 3.0 to 3.3 |
| Median passage length: solution, sinkhole, grotto, lava, sea, talus, glacier | 230 to 310 m, 180 to 190 m, 135 to 180 m, 850 to 1,900 m, 58 to 65 m, 86 to 93 m, 130 to 210 m |
| Karst-and-caves stage | 140 to 175 ms |

Differences from the plan's estimates. Exposed carbonate is a little under the 18 to 21% estimate (ice land is excluded, which I did not measure as the whole gap); covered carbonate is 2.3 to 2.7% against an estimated 5 to 11%, so young sediment rarely has limestone as its best underlying kind in this model; sites are 3.0 to 3.3 per 100 land regions against an estimated 6 to 15 (the density was cut twice after it read as too dense on the map, then reweighted by type); the stage takes about three to five times the estimated 30 to 80 ms, and I did not profile where the time goes. Long karst is now about a third to two fifths of non-absent karst regions (32 to 43%, from the class table), above the 18 to 24% of exposed carbonate a first version gave, because the wider water ramp pushes more regions to full potential. Absent is now mostly dry exposed carbonate; before the relict floor moved it was almost all covered carbonate, and exposed karst could never be absent.

Review findings that changed the model, from the first world runs: glacier dots were 28 to 42% of sites (ice sheets gave a dot per region), only 5 to 8 lava sites existed per world although all basalt read pseudo, sinkholes took the solution length regime and reached the 100 km cap, relict was about 60% of exposed carbonate, and absent was 80% of covered carbonate and nothing else. The per-constant sweeps in the plan were not run.

## References

NPS cave and karst pages, Goldscheider et al. (2020) and the Data Bayou map of caves in the USA are listed in the project README.

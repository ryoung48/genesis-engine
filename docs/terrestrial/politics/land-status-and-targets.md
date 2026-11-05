# Land status and realm-size targets

Scope: `:history`, the late medieval start (867) run to 1800. Source: `src/model/history/sim/targets`, `src/model/history/sim/engine/land-shares`, `src/model/history/sim/engine/events/statehood`, `src/model/history/sim/engine/state`, `src/model/history/record/status`.

Every non-desolate province is in exactly one of three statuses, at the start and on every later date. The simulation also tracks a dated target profile for how much land states hold and how big their realms are. Only the state-held share is enforced; realm sizes are reported against the profile and shaped by the natural brakes below. Ownership is never edited directly.

## Statuses

| Status | Meaning | Population | Sovereign |
|---|---|---|---|
| uninhabited | settlers have not arrived | none | none |
| stateless | settled, under no state | yes | none |
| state-held | inside a sovereign's realm | yes | yes |

Desolate land is a fourth, physical kind that never changes. In the engine, `uninhabited` and `stateless` are two Uint8 arrays, and every uninhabited province is also marked stateless so that every code path that skips sovereign-less land skips unreached land too. The status read by the record, the report and the map is derived: uninhabited if the first array is set, else stateless if the second is, else state-held. A yearly validation counts provinces that break this (a populated uninhabited province, a stateless province with a sovereign, a state province without one); the count must be zero.

Status changes are journalled per province. Settlement turns uninhabited into stateless; founding and absorption turn stateless into state-held. Nothing returns land to statelessness, because the target never decreases. The record keeps a `status` event per province, and a world frame carries `provinceStatus` for the scrubbed date (null for Earth records).

## Target profile

`TARGET_PROFILE.at({ year, habitableProvinces })` returns the state-held share `h` of habitable provinces, the share of state-held provinces in each realm-size bucket, and the size ceiling. Everything is a percentage; no absolute count is a target, because counts change with the point count and shares do not. A **realm** is one sovereign with everything held under them: their own land and all their diplomatic vassals' land. Vassals are never counted as realms, in the simulation or in the CK3 measurement.

Buckets: 1, 2–4, 5–9, 10–24, 25–49, 50–100 and 101+ provinces.

| Year | State-held % of habitable | 1 | 2–4 | 5–9 | 10–24 | 25–49 | 50–100 | 101+ | Size source |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 867 | 56.6 | 2.99 | 8.45 | 12.32 | 16.34 | 10.96 | 18.02 | 30.93 | the `lateMedieval` era weights |
| 1066 | 60 | 3.00 | 18.14 | 10.84 | 12.40 | 7.06 | 8.97 | 39.59 | CK3 sovereigns, singles trimmed |
| 1500 | 71 | | | | | | | | interpolated |
| 1701 | 79 | 1.34 | 3.97 | 6.62 | 11.60 | 7.64 | 8.85 | 59.98 | EU4 |
| 1914 | 95 | 0.17 | 0.72 | 0.69 | 3.04 | 2.34 | 5.39 | 87.64 | EU4 |

Interpolation is linear and piecewise. `h` uses all five checkpoints plus 50 at 476, so 867 is `50 + 10 × (867 − 476) / (1066 − 476) = 56.6`. Size shares interpolate between the 867, 1066, 1701 and 1914 rows only. The 1914 row exists only to interpolate 1701 to 1800, where `h` is 86.4. The ceiling is a hard cap on one realm, not part of the distribution: 809 provinces up to 1065, 1,870 up to 1700, 2,014 from 1701, scaled by the habitable province count against the 10,974 of the 204,000-point verification world.

Sources:

- **State-held share** is a design series (50 at 476, 60 at 1066, 71 at 1500, 79 at 1701, 95 at 1914) taken from the earlier Fast-history work, not sourced data. Cross-check: 3,835 held CK3 counties of about 15,000 km² in 867 is 57.5 million km², about 53% of a 109 million km² habitable world, against 56.6% here.
- **867 sizes** are the `lateMedieval` nation weights normalised, with the 50 to 250 share split 36.8% / 63.2% into 50–100 and 101+, the CK3 867 ratio (612 to 1,050 counties). A test keeps the two in step.
- **1066 sizes** were measured from the local CK3 install at 867.1.1 and 1066.9.15, counting sovereign rulers only: each held county is assigned to its holder, each holder to their liege's holder through the highest-tier title that has a liege, and counties are summed under the ruler at the top. Singles are trimmed to 3% and the freed mass spread proportionally. `scripts/measure-ck3-governments.py` groups counties this way.
- **1701 and 1914 rows and the ceilings** come from the EU4-format tables and period peaks of the earlier work; each bucket's province share is its realm share times its mean size, renormalised.
- A province is treated as one CK3 county, as `ck3.md` does, although a county is about 15,000 km² and a 204,000-point province about 10,000 km².

CK3 measurements by sovereign ruler, in % (820 sovereigns on 3,835 held counties in 867; 752 on 3,917 in 1066):

| Bookmark | Measure | 1 | 2–4 | 5–9 | 10–24 | 25–49 | 50–100 | 101+ |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 867 | sovereigns | 48.54 | 39.88 | 5.73 | 3.17 | 0.98 | 1.10 | 0.61 |
| 867 | counties | 10.38 | 21.56 | 7.80 | 10.14 | 6.78 | 15.96 | 27.38 |
| 1066 | sovereigns | 49.47 | 35.90 | 8.11 | 3.86 | 1.06 | 0.66 | 0.93 |
| 1066 | counties | 9.50 | 16.93 | 10.11 | 11.56 | 6.59 | 8.37 | 36.94 |

The uninhabited share is not steered; it is an output of the [arrival field](../population/migration-and-settlement.md).

## Starting land

The 867 start settles every province whose arrival year is 867 or earlier. `MIGRATION.heldCore` picks `round(h(867) × settled)` settled provinces as state-held, and the rest of the settled world starts stateless. Nations are placed inside that mask with the unchanged placement rules and `lateMedieval` size weights. Every reader that used the era's `statehoodFraction` now reads the generated mask's actual state-held share of settled land.

The count is split between landmasses so that every sizeable landmass has a core of its own, as in EU4 at 1444:

- **Units.** A landmass with at least 1% of habitable provinces is a unit. At that size a young unit still gets about 36 held provinces on the 204,000-point world, one realm in the 25–49 bucket. Smaller landmasses are not units.
- **Mature and young.** A unit holding a cradle active in 867 is mature and grows from those cradles. Any other unit is young and grows from its settled province with the highest site score (`PLACEMENT.nationPlacementScore`, the score that ranks cradles). These seeds do not join the cradle schedule.
- **Budgets.** Each unit's weight is its settled count times 0.916 if mature or 0.280 if young. Its budget is the count times its weight over the sum of weights, rounded, with the rounding remainder on the heaviest unit.
- **Search.** One cheapest-first search at cost `distance / suitability` grows every unit from its sources. A unit never enters another unit's landmass, may take small islands, and stops at its budget.
- **Fill.** If a unit runs out of land before its budget, the search continues from all held land with no unit limits, the rule used before units existed, until the count is reached.

The two shares come from EU4's province owners at 1444.11.11 (`scripts/measure-eu4-owned-by-continent.py`, wasteland excluded, counted in provinces):

| Continent | Owned % of its land | Share of all owned | Share of land |
|---|---:|---:|---:|
| Europe | 98.6 | 33.3 | 25.3 |
| Asia (incl. Siberia) | 91.8 | 42.4 | 34.5 |
| Africa | 78.0 | 14.1 | 13.5 |
| North America | 31.7 | 6.9 | 16.3 |
| Oceania | 30.3 | 1.1 | 2.7 |
| South America | 19.9 | 2.0 | 7.6 |

The 0.916 share is Europe, Asia and Africa together (2,220 of 2,423 provinces). The 0.280 share is the two Americas (221 of 790). Only their ratio matters, because the budgets are normalised to the count. EU4's European provinces are smaller than its American ones, so an area-based ratio would be lower.

The origin landmass usually holds every settled province. The 867 total exceeds its land on the verification world, so its mature share cannot hold land back.

## Absorption

`STATEHOOD.run` follows each census (after settlement and the share refresh). While the state-held share of habitable provinces is below `h`, it takes settled stateless land. Each claim is a weighted draw over (realm, adjacent stateless province) with weight `enclosure² × exp(−3 × max(0, stretch − 1))`. Enclosure is the number of the realm's provinces next to the candidate. Stretch is the distance from the realm's capital to the candidate over `spacing × sqrt((size + 1) / π)`, with spacing the mean distance between adjacent provinces; the factor 3 cuts a claim to 5% at stretch 2. The province joins through the ordinary ownership path (`repartitionNation`), not by array writes. No new states are founded: a world whose settled stateless land has no neighbouring state leaves the shortfall unmet, and the report records it.

## Natural brakes on consolidation

Without a brake the realm-size distribution collapses into a few mega-realms (101+ provinces hold 87% of state-held land at 1067 against about 37% in CK3 at 1066). Two mechanisms act on the war and rebellion rules themselves:

- **Reach.** The chance of declaring a war is multiplied by `exp(−max(0, d − R) / R)`, with `d` the distance from the attacker's capital to the target's nearest province and `R` the reach, 400 km by default (`HISTORY_REACH_KM`). Premodern armies could only supply and hold land within a few marches (a march of 15 to 20 miles a day, Hall, medieval travel speed), and expansion erodes cohesion at the frontier (Turchin, *Historical Dynamics*).
- **Cohesion.** A rebellion test adds `c × (max(0, log2(size / 25)) + log2(distinct cultures))` laxity for the overlord's realm, with step `c = 0.1` (`HISTORY_COHESION_STEP`) and 25 provinces the kingdom-sized reference. Larger and more culturally mixed realms lose solidarity.

The constants are design values chosen from a single-seed sweep over reach 200, 400 and 800 km and step 0.05, 0.1 and 0.2: the mean distance from target fell from 34.5 points (no brakes) to 20.1. Reach had the larger effect; cohesion mostly raised rebellions. They do not reach the profile: the first century still overshoots, with the 101+ bucket near 60% at 1067.

A steering layer that biased war, rebellion and absorption by size-bucket pressure was built and tried. Tuned, it cut the mean distance to about 10, but it also dropped wars per sovereign to about 1.0 to 1.3 (against 3.0 to 3.4 unsteered) and was removed in favour of the natural brakes.

## Report

The detailed report records per window the shares of habitable provinces by status, the share of state-held provinces and of sovereigns in each size bucket against its target, the total-variation distance between them, and the settlements, absorptions and unmet demand. Snapshots at the start, 1066, 1444 and 1701 are kept separately; 1444 lines up with the EU4 table above. Every land snapshot also lists each unit-sized landmass (largest first) with its share of habitable provinces, the held share of its own land, its share of all held land and its cradle count. It also gives `heldCores`, the number of connected groups of held provinces, where provinces connect only if they are adjacent and on the same landmass.

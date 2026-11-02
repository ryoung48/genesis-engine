# Migration and settlement

Scope: `:history`. Source: `src/model/society/migration`, `src/model/society/migration/sea-links`, `src/model/pipelines/post-elevation`, `src/model/history/sim/engine/events/population`.

Every habitable province has one dated first settlement, computed once while the world is generated. The yearly census then replays those dates, so land nobody has reached yet is empty, and everything the simulation does afterwards reads the result.

Both history pipelines (`simulation` and `distribution`) read the same arrival field from `MIGRATION.compute`. The distribution engine replays it through `DISTRIBUTION_SETTLEMENT` and builds its cradle schedule with `MIGRATION.cradles`; the same pass also sets each province's `areaKm2`. Earth imports have no field.

## Arrival field

`MIGRATION.compute` runs one earliest-arrival search from a single origin. The origin is settled at 79,999 BCE, and settlers leave it no earlier than 65,000 BCE, the time modern humans left Africa (about 70 to 60 thousand years ago).

- **Suitability** is a province's habitability per land region, divided by the 95th percentile of that value over non-desolate provinces and clamped to 1. The percentile keeps a few exceptional provinces from slowing the whole world.
- **Origin** is the province in the most habitable land component whose neighbourhood scores highest on suitability, weighted by area and by the share of that area with water access; seeded ties break on a hash.
- **Land links** join adjacent provinces on the same landmass. Province adjacency also contains links across water, which are ignored here; water is crossed only by sea and shelf links, and only between different landmasses, so a bay on one landmass never becomes a faster route than walking round it. Settlers cover 0.7 kilometres a year times mean suitability (at least 0.05), and 1.25 times that along rivers and lakes. From 10000 BCE the speed rises smoothly (a smoothstep in the year) until, at 1500, it reaches fifty kilometres a year times mean suitability, about seventy times the early rate. The rise stands for the spread of farming and then of faster travel; the early rate fits the hunter-gatherer dispersal. A crossing is timed by the progress integral of the speed, so a walk that starts before the rise is accelerated as it goes. The early rate and the departure year are calibrated to the Earth dispersal maps (Stringer; Wells; National Geographic Genographic): Australia about 50 thousand years ago, Europe 45 to 35, Alaska 20 to 15, South America 15 to 12.
- **Sea links** join the nearest shores across open water. The corridor length is the water between the two coasts: the path through ocean cell centres, with the first and last legs from land centre to ocean centre counted only to their midpoint, where the Voronoi coast lies. Ocean cells are much larger than land cells in the deep ocean, so the coast placement is only as precise as the land cells beside it; the report still counts links within one mesh spacing of the first three knots below. A crossing takes `max(departure, capability year) + 100 + length / 10` years.

A crossing cannot start before the capability year for its length, which rises smoothly with length: linear in the logarithm of the length between these points, constant below the first and above the last.

| Corridor | Capability year | Basis |
|---|---|---|
| 130 km | 65,000 BCE | Timor to Sahul, about 90 km, crossed 65 to 50 thousand years ago |
| 185 km | 5000 BCE | Cuba and the Greater Antilles, settled about 5000 to 3500 BCE |
| 850 km | 1000 BCE | Lapita voyaging from Island Melanesia into Fiji, Tonga and Samoa |
| 3,000 km | 800 CE | Open-ocean voyaging into East Polynesia and Hawaii, about 1000 to 1300 CE |

A large landmass is easier to find than a small island, so the length used for the capability year is the corridor divided by `1 + 2 × log10(destination landmass area / 1,000,000 km²)`, never below 1. Landmasses under a million square kilometres are unaffected, so Hawaii, Tahiti and New Zealand keep their dates; a continent across 3,000 km of ocean behaves like a shorter crossing. The factor 2 is calibrated: with it Earth's reference dates still fit (18 of 48 within window) while continents on generated worlds start filling earlier.

The knots are calibrated to these dated settlements, and there are no tiers: the arrival tier recorded for reports is the number of the knot interval the crossing falls in. A corridor measured a few tens of kilometres wrong moves the date smoothly rather than across a gate.

- **Shelf links** join shores across ocean regions at or above −60 m. A shelf link is crossed at land speed with no sea delay when the departure is before 9500 BCE, and is an ordinary sea link afterwards. Sea level stayed below −60 m for most of 80 to 12 thousand years ago and passed it near 11.5 thousand years ago (Lambeck et al., 2014, PNAS 111:15296). One fixed threshold stands in for a level that ran from about −40 m to −120 m, so links that exist only at the last glacial maximum are left out. The shelf crossing time is the earlier of the land and sea times; because a link only ever closes, leaving later never helps and the search stays valid.

Each province keeps its arrival year (an integer; 2,147,483,647 when the search never reaches it or reaches it after 2025), its predecessor, the kind of link that reached it and the arrival tier. `migrationWave` is `(arrival + 79,999) / (2025 + 79,999)` clamped to the unit interval, and −1 for unreached land. Culture, religion, government and population falloff read the wave unchanged.

Unreached land is **uninhabited**, never desolate: it stays part of the world, empty until its settlers arrive or for good.

## Cradles

`MIGRATION.cradles` selects up to eight independent agricultural origins, reviewed every 100 years from 3300 BCE. A province qualifies once it has been settled 2,000 years (the time for a region to support a state) and lies at least `2000 × radius / 6371` km from every earlier cradle, so cradles keep to separate regions at any planet size. Candidates rank by site score times `min(settled years / 2000, 2)` times `min(distance to nearest cradle / spacing, 2)`. The site score is `PLACEMENT.nationPlacementScore` for a one-province state.

## Settlement in the run

`POPULATION.runPopulation` settles every province whose arrival year has come, in arrival order, before the census grows anything:

- the province changes from uninhabited to stateless, dated 1 January of its arrival year;
- it receives rural population from its predecessor, `predecessorRural × w / (w + w_pred)` with `w` the habitability, so population is conserved;
- it takes the predecessor's knowledge.

Cultures and religions cover every habitable province, so a province already has its culture and a name when settlers arrive, and land that is never reached still has both. Uninhabited provinces have no population, are skipped by the yearly growth and development passes, and cannot be founded on or absorbed.

## Starting settlement and states

At the 867 start the settled land is the provinces with `arrival ≤ 867`. A multi-source search from the cradles active in 867 over the land graph, at cost `distance / suitability`, takes the cheapest `h(867) × habitable` provinces as the state-held core; the rest of the settled world starts stateless. If no cradle is active, the search starts at the origin. See [land status and targets](../politics/land-status-and-targets.md). Other eras keep their wave percentiles.

## Report

The Population map mode has Density and Migration children in the overlay controls. Migration colors the arrival field from blue (earliest) through green and yellow to red (latest), using each province's arrival year, scaled from the earliest arrival to the 98th percentile of reached provinces so a few very late arrivals do not wash out the rest. Hover details show the arrival year while this mode is active. Unreached and desolate land stays neutral. This mode is available without debug map modes; Earth imports have no migration field and do not offer the selector.

The detailed history report records the origin, cradles, link counts per kind, sea length quantiles, the gate-sensitivity counts, the suitability scale, and the shares settled at the start, uninhabited at the start and never reached.

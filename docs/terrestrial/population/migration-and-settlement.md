# Migration and settlement

Scope: `:history`. Source: `src/model/society/migration`, `src/model/society/migration/sea-links`, `src/model/pipelines/post-elevation`, `src/model/history/sim/engine/events/population`.

Every habitable province has one dated first settlement, computed once while the world is generated. The yearly census then replays those dates, so land nobody has reached yet is empty, and everything the simulation does afterwards reads the result.

## Arrival field

`MIGRATION.compute` runs one earliest-arrival search from a single origin, starting at 79,999 BCE.

- **Suitability** is a province's habitability per land region, divided by the 95th percentile of that value over non-desolate provinces and clamped to 1. The percentile keeps a few exceptional provinces from slowing the whole world.
- **Origin** is the province in the most habitable land component whose neighbourhood scores highest on suitability, weighted by area and by the share of that area with water access; seeded ties break on a hash.
- **Land links** join adjacent provinces. Settlers cover one kilometre a year times mean suitability (at least 0.1), and 1.25 times that along rivers and lakes. From 1500 they cover fifty times that. A crossing from before 1500 into after it spends the early speed up to 1500, then the late speed.
- **Sea links** join the nearest shores across open water. The corridor length is shore to the Voronoi boundary to shore, which can overstate a crossing by up to one mesh spacing, so the report counts links within one spacing of each tier boundary. A crossing takes `max(departure, capability year) + 100 + length / 10` years.

| Corridor | Capability year | Tier |
|---|---|---|
| up to 150 km | 79,999 BCE | 1 |
| up to 500 km | 2999 BCE | 2 |
| up to 2,000 km | 999 BCE | 3 |
| longer | 1500 | 4 |

One table holds the lengths and years; arrival tiers and crossing times both read it.

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

The detailed history report records the origin, cradles, link counts per kind, sea length quantiles, the gate-sensitivity counts, the suitability scale, and the shares settled at the start, uninhabited at the start and never reached.

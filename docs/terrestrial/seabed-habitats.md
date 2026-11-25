# Seabed habitats and atolls

Scope: terrain generation.

Two small layers over the ocean of a procedural world: a habitat (coral reef, kelp forest, seagrass meadow, rocky reef) with a share of the cell on shallow coasts, and a list of atoll sites. They only colour the maps; nothing in elevation, climate, rivers, groundwater, the shoreline or history reads them. Earth imports have no shore layer, so they have no seabed layers and their ocean is unchanged.

Code: `src/model/geography/terrain/seabed` (`SEABED`, `SEABED_HABITAT`, `SEABED_ATOLLS`), constants in `src/model/geography/terrain/seabed-config`.

## Pipeline position

One stage, `Post: seabed`, in `pipelines/post-elevation`, right after `Post: shoreline`. It reads the shore layers (material, lee exposure), rivers, monthly sea temperature and ice, and the present-day crust record. It writes the `seabed` layers (`substrate`, `habitat`, `share`), `seabedStats` and `atolls`, which reach the UI through the worker transfer list beside `shore`. The stage copies nothing it reads and mutates none of it; it has no random draws.

## Shallow share

The mesh cell is about 57.6 km across, far wider than a shelf, so a cell's mean depth says almost nothing about the shallow seabed inside it (1.7% of cells touching land are under 50 m deep, seed 14963991). Instead the cell gets a *share*: the part of its area that is shallow enough for light-dependent life.

- **Reach.** Open-water cells within 175 km of a coastal land region (`SPREAD.km`, three mesh edges; beyond ring 3 under 0.3% of cells are shallower than 200 m). Each reached cell remembers its nearest coastal land region, its *source*. Lake cells block the spread.
- **Share.** `min(1, 30 m / depth) × plume`, as a percent. A seabed ramping linearly from the shore to the cell centre has a shallow fraction of `30 / depth`. `plume` falls from 1 to 0 (smoothstep) as the source region's river flow goes from 50 to 500 m³/s, the estuary and delta edges the shoreline uses: a large river mouth cuts light and salinity.
- Cells under 2% carry no habitat, which is every cell deeper than 1,500 m.

## Habitat

One habitat per cell, first match wins. The *substrate* is the source region's shore material.

1. **Coral reef.** Coldest month at least 18 °C; substrate rock, sand or gravel.
2. **Kelp forest.** Warmest month at most 20 °C; at most 6 ice-covered months; substrate rock or gravel.
3. **Seagrass meadow.** At most 6 ice-covered months; substrate sand or mud; the source's lee exposure at most 1.5 m (sheltered).
4. **Rocky reef.** Rock substrate.

Ice and no substrate carry nothing. The coral and kelp gates overlap only for a cell whose whole annual range sits between 18 and 20 °C, and then coral wins.

## Atolls

Darwin's sequence: a volcano that stood in warm water grows a fringing reef, the volcano subsides and wears, and a ring of reef is left. A site is a hotspot-track cell of the present-day crust record with:

- oceanic crust and `volcKm` at least `seamountKm` (1 km): it was a real volcano;
- `volcKm − volcWornKm` under `hotspotMinKm` (0.4 km): worn below the stamping threshold, so the world has no island there;
- a world region (the volcano stamper's nearest-region snap) that is open water with a coldest month at least 18 °C. In colder water the same remnant is a drowned seamount and is not listed.

A site carries `ageMyr = volcWornKm / islandErosionKmPerMyr` and `peakKm = volcKm`. Sites sharing a region merge to the oldest. Cays, lagoons and diameters are not modelled: nothing in the mesh constrains them. Atolls are decorative; they have no province or population.

Sites depend on how many oceanic hotspot tracks the world has. With the old 4 to 7 plumes there were 0 to 28 oceanic track cells per world and 0 to 3 sites; with 24 to 32 plumes at full ocean weight there are 6 to 9 sites and 26 to 41 hotspot island regions (3 seeds); at 40 to 55 plumes there were 8 to 41 sites but 54 to 73 island regions. About one oceanic track cell in 20 ends as a site: most volcanoes still stand, and most worn ones sit outside warm water. Earth has hundreds of atolls.

## Constants

| Constant | Value | Reason |
|---|---|---|
| `photicDepthM` | 30 m | Duarte (1991) seagrass depth limit at clear coastal water (K = 0.07 m⁻¹, a choice); corals and kelp thrive in about the same top 30 to 40 m |
| `shareMinPercent` | 2% | A 1.2 km belt in a 57.6 km cell, the narrowest bed worth showing |
| `reachKm` | 175 km | Three median mesh edges |
| `coralMinColdC` | 18 °C | Kleypas, McManus & Meñez (1999) |
| `kelpMaxWarmC` | 20 °C | A choice; kelp is a cool-water group |
| `iceMonthsMax` | 6 | A choice |
| `seagrassLeeMaxM` | 1.5 m | Hayes (1979) medium-energy upper edge, the shoreline's second exposure edge |
| plume edges | 50, 500 m³/s | The shoreline's estuary and delta flows |
| `seamountKm`, `hotspotMinKm`, erosion | 1 km, 0.4 km, 0.15 km/Myr | The volcano stamper's own values, so sites and stamped islands never disagree |

## Maps

- **Vegetation** (Base, Maps, Satellite): ocean cells with seagrass or kelp blend from their ocean colour toward green or olive by `0.25 + 0.75 × sqrt(share / 100)`. The square root is the compression the land satellite colour applies to rainfall; the 0.25 floor (a choice, halfway between no floor and a first attempt at 0.55 that read as too strong) lifts a typical 3% share from a 17% blend to 38%. Observed-data variants have no layer and are unchanged.
- **Topography Classification**: ocean cells blend toward coral pink or grey-brown for coral and rocky reef. Atoll sites are dark teal outlined circles, drawn through the shared site-symbol channel (the one cave dots use) in this sub-mode only; the ring's outer radius equals a cave dot's (0.0035 rad), dark teal.
- Hover on an ocean cell shows the habitat with its share, substrate and any atoll with its age and peak height. The world panel has a Seabed distribution chart.
- Land colours are unchanged. There are no toggles or extra map modes.

## Measured shares

Default 204,001-region world, three seeds (`SEABED_SHARES=1`, `src/test/seabed/shares.diagnostic.smoke.test.ts`, run 2026-11-25).

The habitat rows were measured with the original 4 to 7 plumes; moving to more plumes changed habitat cells by under 3%.

| Metric | 14963991 | 20251107 | 77031 |
|---|---|---|---|
| Ocean cells reached | 12.3% | 12.6% | 12.3% |
| Cells with a habitat, of all ocean | 5.2% | 5.2% | 3.9% |
| Habitat share, median / mean | 3 / 6.2% | 3 / 10.7% | 3 / 6.5% |
| Coral, of habitat cells | 54.7% | 63.0% | 56.4% |
| Kelp | 13.9% | 16.8% | 21.4% |
| Seagrass | 17.0% | 9.9% | 11.9% |
| Rocky reef | 14.5% | 10.2% | 10.3% |
| Atoll sites (after the plume change) | 6 | 8 | 9 |
| Stage time | 56 ms | 53 ms | 95 ms |

Reading against Earth (from memory, not model inputs): reefs cover about 0.1% of the ocean's area; here coral cells times their mean share come to roughly 0.2% of the ocean, about twice that. Coral is more of the habitat mix than predicted (25 to 40%): the 18 °C gate admits most warm coasts and coral is first in the order.

## Not modelled

Cays and atoll geometry, atolls from arcs, rifted fragments or carbonate platforms, barrier reefs and lagoons, patch reefs inside a cell, hurricane damage, aragonite saturation, salinity limits, an explicit nutrient or upwelling term (cold water stands in for it), water clarity beyond river plumes, vents, cold seeps, trenches, hadal ecology, change over time, and mangroves and salt marsh (the [shoreline](shoreline.md) owns those).

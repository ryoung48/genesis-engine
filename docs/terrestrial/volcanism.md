# Volcanoes: plumes, arc sites, edifices and hazards

Scope: terrain generation. Overview in [tectonics.md](tectonics.md); the arcs these volcanoes stand on are in [island arcs](island-arcs.md).

Volcanoes are placed from the present-day records, not from a volcanism parameter. The `volcanism` parameter is inert: its type, slider and plumbing remain, and nothing in the model reads it. Code: `src/model/geography/terrain/plumes`, `arc-sites`, `volcano-edifices` and `hazards`.

## Plumes and hotspot tracks (`plumes`)

24 to 32 mantle plumes (`plumeCount`) are fixed under the moving plates, between the 7 deep-mantle primary plumes and the 49 candidate hotspots Courtillot et al. 2003 list (from memory). 40 to 55 was tried and gave 54 to 73 hotspot island regions per world, too many scattered islands. A plume is accepted with probability 1 under land and under sea (`plumeOceanWeight`, 0.4 and 4 to 7 plumes before 2026-11-25, which left most worlds with no oceanic hotspot track to turn into atolls), at least 1,800 km from the others (`plumeApartKm`; Earth's hotspots are of order thousands of km apart, Courtillot et al. 2003). Each draws on streams keyed by its try index, so an edit that turns the land under one plume leaves the others as they were.

A track walks back along its plate's rotation (the crust now at the rotated plume passed over it that long ago) in 0.5 Myr steps up to 90 Myr (`trackMyr`; Hawaii-Emperor is about 80), stopping where the nearest cell is on another plate (the 90 Myr length is set from the Hawaiian-Emperor chain, Sharp & Clague 2006). It alternates bursts of eruption (0.6 to 2 Myr, one volcano each, building 8 km/Myr times the plume's strength 0.6 to 1.4, capped at 10 km, 70 km wide) with quiet spells of 1.5 to 5 Myr, on a swell 110 km wide. The volcano over the plume is still active (under 2 Myr); the rest is worn at 0.15 km/Myr after that, so a 5 km volcano is gone in tens of Myr (a tuned value; no single cited rate).

Between 2 and 6 plume heads (`lipCount`) make a flood basalt, each with chance 0.8 (`lipChance`, up to the drawn count; it was 0 to 2 with chance 0.45, which left basalt at 0.9 to 1.3% of land against a few percent on Earth, not checked against a cited source; now 1.4 to 2.1% on seeds 14963991, 20251107 and 77031), 15 to 200 Myr old on the track, 0.15 to 2 million km² (log-uniform; the Deccan is about 0.5), 2 km thick, with a lobed outline (Ernst 2014 for the province sizes). A LIP on land wears at 0.004 km/Myr.

A LIP also raises the ground (`PLUMES.lift`, applied in the volcano stamp before the cones): each region under it gets its remaining pile (thickness minus wear, at most `lipMaxPileKm`) times 0.75 km of height per km of basalt on land or 1.4 km per km at sea (an oceanic plateau). The lift is then diffused over about `lipFeatherKm` and never lowered inside the province, so the edge slopes instead of stepping. LIPs are a terrain feature (shown in purple on the features map mode) but still carry no volcano danger.

A track is written wherever its plate carries it, in either rotation direction, until it reaches another plate. Hotspot cones are stamped only where the track crosses oceanic crust: a track under a continent stays a record (the crust's `volcType`), and a volcano old enough to have worn below `hotspotMinKm` is dropped. A dropped volcano that stood at least `seamountKm` high and now sits in water that never falls below 18 °C is an atoll site on the map; see [seabed habitats](seabed-habitats.md#atolls).

## Arc and Andean sites (`arc-sites`)

- **Island arc cones**: on the cells of `arcRun.crust.arcFront` (already the volcanic front on the trench side; every arc is on a front subducting now, so no activity test applies), chance 0.6 per sim cell. Height 2.5 km young to 2.0 km mature (mature at 150 Myr), radius 34 to 48 km.
- **Andean stratovolcanoes**: along the main range of an active Andean belt (record time within 15 Myr), 70 to 260 km from the belt's front (30% of its width), chance 0.35 per sim cell, 1.2 km high, 34 km radius. A flat slab belt (Laramide) is silent.
- Strike of the belt comes from the gradient of the belt position, so the cone's long axis runs along it.

## Edifices and stamping (`volcano-edifices`)

An edifice is not an oval: its coordinates are warped by smooth noise, its outline has three lobe harmonics (up to 10% each) and a fine fifth (4%), it may have 0 to 3 arms (a shield's rift zones, an arc volcano's ridge along the arc), satellite vents along the arms, gullies cut into the lower flanks (deeper as it erodes), and sometimes a flank-collapse scar. Its shape is drawn from the stream of its record cell. As a volcano erodes it spreads: `f = 1 - exp(-age / 25 Myr)` makes it up to 60% wider and 35% lower and rounder. Gullies fade where the mesh is too coarse to show them (under 2 mesh cells per wavelength, full at 3.2).

Hotspot edifices stand on the sea floor (`-(2.6 + 0.345 sqrt(age))` km, capped at 6.4: Parsons & Sclater 1977): their top is the floor plus their height, and where the footprint reaches higher ground only what rises above it is added.

Arc and Andean cones add their height to the ground under them, wherever that ground is; a cone on submerged crust is stamped below the surface and may not show.

The stamp adds to the mesh elevation after terrain warp, smoothing, erosion and soil creep, before craters and sea level, so what is stamped is what the world keeps (an earlier version stamped before erosion and lost most of each cone's height). A hotspot island is an island only where it clears the final sea level.

The mesh is coarse (about 54 km between regions at 204,000 regions), so each cone's centre is snapped to its nearest region centre, and its radius is at least `minRadiusMeshEdges` (1) mesh edge, so the summit region sees the cone's full height rather than about a third of it. It also marks the terrain features: volcanic arc for arc and Andean cones, the new hotspot volcano for tracks, large igneous province for LIPs (the last two from the crust records).

## Hazards

`HAZARDS.computeHazards` now takes `volcanoActivity`, a field over the mesh: for every edifice that is active by its own record (a hotspot volcano under 2 Myr since its last eruption, every arc cone, every Andean cone), the regions of its core (where it adds at least a quarter of its own rise, `activityCoreShare`) get the kind weight: 0.9 for arc and Andean, 0.6 for hotspot. Extinct edifices and LIPs contribute nothing. The volcano danger is this field spread outward (`propagateInfluence`) so it falls to 0.05 at about 100 km. The old boundary term (any convergent boundary near a mountain, with or without a volcano) and the hotspot term are gone; earthquake danger is untouched.

## Constants

| Constant | Value | Basis |
|---|---|---|
| `plumeCount` | 24 to 32 | Courtillot et al. 2003: 7 primary and about 49 candidate hotspots; a middle value chosen for atoll count against scattered islands |
| `plumeApartKm` | 1,800 | spacing of the major Earth hotspots |
| `trackMyr` | 90 | Hawaii-Emperor, about 80 Myr (Sharp & Clague 2006) |
| `trackBuildKmPerMyr` / `trackMaxKm` | 8 / 10 | Hawaii: about 9 km above the floor over a few Myr |
| `islandErosionKmPerMyr` | 0.15 | tuned: a 5 km volcano is gone in tens of Myr |
| `lipCount` / `lipChance` | 2 to 6 / 0.8 | Raised from 0 to 2 / 0.45 so exposed flood basalt reaches 1.4 to 2.1% of land (Earth's continental flood basalts add up to a few percent; not checked against a cited source). Each LIP also lifts the ground, so this changes elevation |
| `lipAgeMyr` / `lipAreaKm2` | 15 to 200 / 0.15 to 2 million | Ernst 2014 |
| `arcConeShare` / `andeanConeShare` | 0.6 / 0.35 | upstream, tuned for one cone per few sim cells |
| `activityCoreShare` | 0.25 | tuned: danger starts at the summit and upper flanks, not the faint skirt of a widened cone; on the default seed it cuts regions above 0.05 volcano danger from 3,375 to 1,944 |
| `minRadiusMeshEdges` | 1 | a feature needs at least two samples across its diameter, so a radius of one mesh edge |
| `lipLandKmPerKm` / `lipSeaKmPerKm` / `lipMaxPileKm` | 0.75 / 1.4 / 2.5 | World Orogen's terrain config (`lipLandKm`, `lipSeaKm`, `lipMaxKm`): a flood basalt on land rises 0.75 km per km of basalt (Deccan and Columbia plateaus stand 0.5 to 1 km), an oceanic plateau 1.4 km per km (Ontong Java rises about 2 km above the floor) |
| `lipFeatherKm` | 200 | between upstream's 150 km sea smoothing and 250 km land feather |
| volcano hazard reach | 100 km | roughly the ash-fall and flow reach of a stratovolcano |

The full cone shape constants are in `present-config`'s `volcano` block.

## Not modeled

- Rate-based earthquake danger (earthquake danger still comes from the boundary stress).
- Ridge volcanism (the mid-ocean ridge is marked, but has no volcano danger).
- Plume count tied to the heating or volcanism parameter.
- Escarpment retreat, canyons, stepped walls and plume domes on flood basalts.

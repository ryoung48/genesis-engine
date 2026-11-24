# Island arcs and back-arc crust

Scope: terrain generation (not `:history`, `:climate` or `:galaxy`).

Island arcs, arcs split off a continent's edge, the seas behind them, Sunda-style broken continents and microcontinent slivers are synthesized from the present-day state only: the moving plates, their motion and the sea-floor age. Their ages and per-front duration are drawn once, on streams of their own, and are the premise of the story rather than the result of a replay. Code: `src/model/geography/terrain/arc-crust` (where crust is cut), `src/model/geography/terrain/arc-heights` (how high it stands), with `plate-motion`, `plate-fronts` and `sea-floor` under `src/model/geography/tectonics`.

The stage ports the arc, split and Sunda parts of `subduction()` from World Orogen's `present/belts.js` (see the README references), on our own mesh (about 204,000 regions) rather than a coarse sim mesh.

## Moving plates and fronts

- The moving plates are the super plates when there are at least 8 coarse plates (each is a connected group of one crust type, with its own Euler vector and density), otherwise the coarse plates. A plate is wholly continental or wholly oceanic, so crust type is the plate's ocean flag.
- Plate velocity comes from `MATH.eulerVelocityAt`, scaled once so the area-weighted RMS plate speed is 4 cm/yr (Earth's is of order 4-5 cm/yr). Only the global scale is set; relative speeds stay ours.
- Each mesh edge between two moving plates is classified from the relative motion at its midpoint, averaged along the same plate pair over about 450 km: slower than 0.4 cm/yr is inactive, closing or opening under 0.45 of the slip is a transform, opening between oceanic plates is a ridge, closing is subduction unless both are continental. The continental side rides over; between two oceanic plates the less dense side does.
- Edges group into fronts by plate pair and kind. A subduction front draws its active time once from 40-140 Myr on a stream keyed by its plate pair, so the slab length (rate x time) is consistent along it.
- Sea-floor age is distance from the nearest ridge divided by half the spreading rate (at least 1 cm/yr), spreading over each plate's own floor, capped at 180 Myr. Floor no ridge reaches ages on at 1.2 cm/yr, or starts at 90 Myr at its plate's edges.

## Ocean-ocean trenches: island arcs

An arc is cut on the upper plate where the slab goes down at least 2 cm/yr, is at least 15 Myr old and has been consumed for more than 1,000 km. It stands along only part of the trench: the chance rises from 0.3 beyond 1,800 km from continental crust to 0.9 within 500 km (arcs trail from their continents), minus a strike noise of wavelength 900 km. Where it stands:

- Width: 121 km, plus 121 km per 500 km of slab beyond 1,000 km, capped at 280 km, times a strike factor of 0.45-1.5 and tapering toward the stretch's ends.
- Setback from the trench: 40-150 km.
- Age: one draw of 25-120 Myr per arc (at most the front's active time), down to 15% of that toward the ends.

## Continent margins: Andean or split

An ocean-continent front stays Andean (terrain unchanged) or splits. The chance is `0.35 + 0.35 x (slab age - 60 Myr)/100 - 0.12 x drive`, bounded to 0-0.85, where drive is the upper plate's velocity toward its trench in cm/yr. It is drawn along the front by a strike noise of wavelength 1,600 km. A split cuts a continental strip 120-220 km wide into arc crust (islands, 40-140 Myr old) and opens a sea of 220-520 km behind it, floored by young ocean crust of at most 6-30 Myr, youngest mid-basin and narrowing toward the stretch's ends. Slivers of continent are left in the sea as microcontinents (14% of it, in patches of about 350 km).

With chance 0.3, and for at most 2 fronts a planet, the continent behind the arc is stretched instead: the arc becomes a chain of long islands with straits, the sea reaches 600-1,200 km, and blocks of about 750 km stand over about 38% of it, the rest shelf sea. Shelf sea more than 260 km from every block is deep basin.

## Heights

Arc crust: `h = -2 + (matureAt + 2) x m^0.7 + 1.0 x m x island`, with `m = min(1, age/40 Myr)`. `matureAt` blends from -0.2 km (1,000 km or more from continental crust) to 0 km (within 300 km) by smoothstep squared. `island` is a two-octave noise of wavelength 200 km, in -1 to 1. A second noise of wavelength 330 km cuts the strip across its whole width where it is low (about half the arc cells, blending the height to -0.8 km and overriding the edge blend, which otherwise leaves a fringe of old land along the coast), so an arc is a chain of separate islands of a few hundred km rather than one ribbon. Within 120 km of the arc's edge a strait is cut where the island noise is low (up to 20 km), which lowers the cell to at most -0.1 km.

Back-arc sea floor: `-(2.6 + 0.345 sqrt(age))` km, capped at 6.4 km (half-space cooling). Shelf-sea cells are held near -0.25 km, softly over 0.12 km. The sea only lowers existing land.

Heights are written after the main elevation loop and coastal roughening, before the volcano edifices are stamped after erosion (see [volcanoes](volcanism.md)), in the world's own units (`maxElevation`, the radius-scaled ocean depth). Footprint cells blend with the existing elevation over 60 km at the footprint's edge, so cells outside the footprint are never written.

## Not modeled

- Cratons: a split may cut any continental crust within reach.
- Collision of an arc with a continent on the diving plate (`arcCollide*`): our plates are single-crust-type, so a continent never rides the diving plate of an ocean-upper-plate trench.
- Fore-arc islands, rift seas and valleys, the Andean and collision belts themselves.
- The old island-arc uplift and the old back-arc band (a smooth depression behind every ocean-adjacent convergent boundary) are gone. The depression behind Andean margins goes with them, so land behind those margins sits slightly higher than before.

## Output

`GenesisWorld.arcRun` carries the crust (`crustType`: continent, arc or ocean; `arcType`: oceanic, continental split or Sunda-style split; `formedAtMyr`, negative; `shelfSea`; `sundaDeep`; `arcFront`, the arc cells within one edge of the trench side), the plate motion, the fronts and the sea-floor age, for the records and volcano stages to read. The Features map and hover labels distinguish the three arc types where arc height changes contribute to the terrain; the dominant feature determines the map color.

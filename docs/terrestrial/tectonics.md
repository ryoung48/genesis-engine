# Present-day tectonics records

Scope: terrain generation (not `:history`, `:climate` or `:galaxy`).

The world's plates, boundaries and elevation are drawn by the existing terrain stages and are not changed by the records. On top of them, a records stage reads the present-day state (moving plates, their motion, the sea-floor age, the elevation features) and writes what a long tectonic history would have left: where each belt stands and how old it is, the continents' craton cores and terranes, old worn ranges, the sediment cover, hotspot tracks, flood basalts and the volcanoes on arcs and Andean margins. Only the volcano edifices and the volcano hazard feed back into the world; the rest are records.

The stage ports the present-day record stages of World Orogen (see the README references) onto our plates. Code is under `src/model/geography/tectonics`, `src/model/geography/terrain` and `src/model/pipelines/present-tectonics`.

## Data flow

Pass 1 runs inside `GENERATE_WORLD` right after `blendElevation` (`PRESENT_TECTONICS.build`):

1. **Plate motion and fronts** (`plate-motion`, `plate-fronts`): the same moving plates as the arc stage. Fronts are now typed `subduction`, `ridge`, `collision`, `rift` or `transform`, and each non-ridge front draws an active time; coarse plates in one super plate share the draw (`durationGroup`), so a front's work is the same whichever stage reads it.
2. **Sim mesh and world sample** (`sim-mesh`, `world-sample`): a fixed 40,000-cell sphere mesh (jitter 0.35, seed 16587) is the raster all records live on. World fields are gathered onto it (a cell takes the region nearest its centre; the elevation-feature footprint is the OR of every region that cell stands for, so the 204,000-to-40,000 reduction does not drop a mountain belt). Fronts are sampled onto it with per-cell closing and along-strike rates.
3. **Crust raster** (`crust`): one struct of typed arrays per sim cell: plate, crust type (ocean, continent, craton, arc), formation time, terrane, the orogeny records, the geologic record and the volcanic record. See [tectonics-record.md](tectonics-record.md).
4. **Past** (`bent-pieces`, `range-shape`, `crust-past`): craton cores, terranes docked outward in time, old worn ranges and the swells between them.
5. **Belts** (`orogeny`, `belt-records`, `belt-profile`): today's belts, written over the past.
6. **Plumes, arc sites, edifices** (`terrain/plumes`, `terrain/arc-sites`, `terrain/volcano-edifices`): see [volcanism.md](volcanism.md). The edifices are stamped on the mesh elevation after terrain warp, smoothing, erosion and soil creep, before craters and sea level, so the stamped height is the final height.

Pass 2 runs after the final land mask exists (`GEOLOGIC_RECORD.build`): the sediment cover, facies, exhumation, forelands, shelves, rift basins, arc and setting flags of every land cell, and a few old flood basalts.

Rock kind and soil fertility are derived from this record after elevation and climate; see [rocks and soil](rocks-and-soil.md).

## What is read from the world

- `r_plate`, the coarse plate vectors, ocean flags and densities, the super-plate grouping.
- `terrainFeatures.featureMask`: the belt footprint. A belt may only be written where an elevation stage already raised fold ridges, a plateau, a rift valley, a pull-apart basin or (subduction) a trench.
- `arcRun.crust` (type, formation time, `arcFront`, shelf sea) and `arcRun.seaAgeMyr`.
- The final land mask, for pass 2.

## What is not ported, and why

- The upstream plate sim's own coast, hold, fit and seam layers, the far field (a collision pushing through its continent) and per-plate crust frames: our plates are single-crust-type and not re-fitted, so the geometry they depend on is not ours.
- Terranes inside belt records on collision fronts beyond the per-terrane work share (`segmentVary`, 0.35).
- Rift shoulders' valley line and en-echelon stepping: rifts are written as shoulders only, between two continental plates.
- Arc cells carry arc records written directly from the arc crust; no heights are built from them (the arc stage already stands the islands).
- Earth data is never used in production.

## Determinism and locality

Every draw is on a stream keyed by what it belongs to (a try index, a front id, a crust cell), so two generations of one seed are bit-identical and an edit that changes one plume, front or terrane leaves the others alone. The `volcanism` parameter is inert: nothing reads it. A later change may scale the plume count with it.

## Checks

`src/test/tectonics/` holds the smoke tests (`pnpm vitest run --project smoke src/test/tectonics`): motion and fronts, belts, past, record, plumes and sites, volcano stamps, hazards, and the inert `volcanism` parameter. Each generates a default world (about 35 s).

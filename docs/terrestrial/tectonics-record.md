# Crust raster, belts, past and geologic record

Scope: terrain generation. Overview in [tectonics.md](tectonics.md).

Source: World Orogen's `present/` stages (see the README references), ported to our types, units and plates. Km on a 6,371 km sphere, time in Myr, negative in the past. All constants are in `src/model/geography/tectonics/present-config` (the past, ranges, record and volcano values) and `tectonic-config` (belt widths, speeds, work shares, heights).

## Crust raster (`crust`)

One value per sim cell, typed arrays (`CRUST.create`):

| Group | Fields |
|---|---|
| Identity | `plate` (coarse plate), `type` (ocean 0, continent 1, craton 2, arc 3), `flags` (suture, failed rift, rift margin, LIP), `formedAt`, `terrane` |
| Orogeny | `oroType` (none, Andean, Laramide, Ural, Himalayan, arc, rift, transpression, intraplate), `oroWork`, `oroStart`, `oroLast` (0 means active now), `thickKm`, `beltU` (0 at the front, 1 at the belt's edge), `beltReach`, `beltAt`, `beltSide`, `beltShear` |
| Previous orogeny | the same, as `prev*`: what the belt overprinted |
| Relief | `rootKm`, `upliftKm`, `baseKm` (swells), `rugged`, `prevRugged` |
| Volcanic | `volcType` (none, track, LIP), `volcAt`, `volcKm`, `volcSource` (plume id + 1), `volcWornKm` |
| Geologic | `geoFlags`, `coverKm`, `coverMaxKm`, `coverMaxAt`, facies (`coverCarb`, `coverSalt`, `coverCoal`, `coverOrganic`), `exhumKm`, `unroofKm`, `floodMyr`, `floodLast`, `arcMyr`, `riftAt`, `shelfSea` |

## Orogeny (`orogeny`, `belt-profile`)

`OROGENY.spreadBelt` writes one belt: a breadth-first spread from the source cells over the cells the `allow` predicate accepts, with a cost that grows away from the source. It records the belt in the cell (escalating over what was there into `prev*`), thickens the crust and cover, and builds the cell's uplift, root and ruggedness from the belt kind's profile. Widths come from `beltWidthKm` (a base plus a share per km of work, capped per kind) times a shape factor from how head-on the convergence is and, for subduction, the slab's age (young slabs flatten to a Laramide belt).

## Belt records (`belt-records`)

Written in the order rift, subduction, collision, transform, so a younger belt overprints. Work is `rate × active time`, scaled per cell by `segOf = 1 - 0.35 × draw` (one draw per terrane), so a range varies along its length and never exceeds what its front built.

- **Subduction**: Andean or Laramide belts on the upper plate (a flat slab where the slab is younger than 25 Myr and advancing); coupling to the trench 0.25 to 1 by how fast the plate moves toward it. Arc cells take ARC records directly from the arc crust.
- **Collision**: Himalayan on the side with more land, foreland on the other, Ural on short contacts (under 150 km). Sutures are flagged.
- **Transform**: transpression belts where the plates close.
- **Rift**: rift shoulders on fronts between two continental plates.

The footprint is the set of cells the elevation already drew a feature on, so a record never appears where no relief does.

## Past (`bent-pieces`, `range-shape`, `crust-past`)

- **Pieces** (`bent-pieces`): the land cells of each continental plate, dragged by today's collisions (up to 350 km, fading over 450 km), then bent by two noises (2,400 km / 240 km and 1,100 km / 100 km) so the old terrane outlines are not the plate outlines. Each piece is cut into 1 to 4 terranes by farthest-point seeds.
- **Cores and rings** (`crust-past`): per landmass of at least 1.5 million km², up to 4 craton cores (the pieces deepest inland, aged 1,800 to 2,000 Myr), and the other pieces dock outward from them in rings of 650 to 950 km, younger outward (ages down to 40 to 300 Myr). Craton interiors are 160 km in from a piece edge and 400 km from the sea. A quiet docking (30%) leaves a suture and no range.
- **Events**: a ring docking (Ural belt on the piece's outline), a minor seam between two terranes of one piece (older than 40 Myr), and a weld where two cores meet (the last at 250 to 600 Myr, the others 700 to 1,400 Myr). Each is shaped by `range-shape` and replayed oldest first, the land wearing between events (relief, root and ruggedness each on their own clock, faster the higher the belt stands).
- **Range shape** (`range-shape`): a range keeps its own outline, lightly smoothed, swells and pinches along it by noise, then is carved into massifs by a warped fractal mask (the original generator's lesson: mountains are a noise field cut out of the tectonic one). Its style (spine, plateau, folds, blocks, sliver, knots) is rolled by what made it and how young it is.
- **Swells**: uplands along the seams, lowlands between, craton halved, sinking toward the coast (`baseKm`).

## Geologic record (`geologic-record`)

The deposits stage reads this record; see the [deposits overview](deposits/overview.md).

Written in closed form, per land cell, in the order the plate history keeps it:

1. How deep the basement is worn: shield by its own amount (16 to 28 km), belts about it less (6 to 16 km), plus each belt's wear since it rose (an old belt the longer ago, a live one by how much it stands), capped at 60 km.
2. The cover, oldest first: the platform (thick in the basins, thin on the swells; 0.25 to 2.5 km), rift basins along passive margins and failed arms, forelands in front of every belt that had one, thickening in belts, inland seas of the low interiors (not over exposed shield: a craton patch left bare by `recShieldBare` and `recShieldPatchKm` is kept dry), shelf wedges.
3. Facies of each layer by latitude (warm clear seas lay carbonate, the arid belt salt, the wet belts coal, restricted seas black mud), the youngest on top.
4. Flags: foreland, rift basin, ophiolite, slab change, shelf, inland sea, was-arc; the arc time of live arcs and docked arcs.
5. A few old flood basalts inland (2 to 5, 250 to 1,500 Myr old, 0.3 to 2 million km²). The rock stage reads them as basalt where the province survives (see [rocks and soil](rocks-and-soil.md)).

The surface rock and soil stage reads the record; see [rocks and soil](rocks-and-soil.md).

## Checks against Earth

`src/test/tectonics/record-shares.diagnostic.smoke.test.ts` asserts nothing. Run it with `$env:TECTONICS_RECORD_SHARES = '1'; pnpm vitest run --project smoke src/test/tectonics/record-shares.diagnostic.smoke.test.ts` (about 70 s, three default worlds); it writes `stats/tectonics/<UTC timestamp>-record-shares/report.md` and `shares.json`. Earth figures are used only to read the report, never in the model or in committed assertions.

Shares of land cells on seeds 14963991, 20251107 and 77031:

| Metric | Ours | Earth reference |
|---|---|---|
| Land with sediment cover above 0.05 km | 56 to 62% | 66% (introductory sedimentary geology notes) to about 80% (Ronov, via the National Academies) of continental area, the larger figure counting submerged shelf |
| Craton cells | 14 to 19% | no global figure found |
| Craton cells with no cover | 9 to 10% of land (about half of craton cells) | Precambrian rocks at or near the surface in about 10% of the conterminous United States, nearly half of Africa |
| Cells ever flagged epeiric | 39 to 43% | flooded area peaked at about a third of the continents at one time (Scotese 2021), so a cumulative flag must exceed 33%, and cannot exceed the sediment cover share |
| Mean share of the last 540 Myr under an inland sea | 13 to 14% | below the one-third peak, as expected for a time average |
| Carbonate, evaporite, coal and black shale as shares of cover thickness | 19 to 20%, 1%, 8 to 11%, 3 to 5% | not checked against a cited source |

Reading: before inland seas skipped bare shield, 95% of craton cells carried an epeiric layer, so bare shield was 1 to 2% of land. Keeping the bare patches dry brought it to the US figure. Sediment cover is now below the 66% reference, which counts shelf we do not model on land cells; the epeiric flag is still above the one-third peak.

Rock family shares of land regions (young sediment, sedimentary, metamorphic, plutonic, volcanic) on the same seeds are in [rocks and soil](rocks-and-soil.md#checks).

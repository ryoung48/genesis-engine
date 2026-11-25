# Shoreline

Scope: terrain generation.

Every coastal land region of a procedural world gets a wave exposure on two faces, a relief class, a shore material, a habitat and a setting, and one of eleven labels summarising them. The attributes describe the dominant character of the region's coast, not individual sites. Earth imports have no shore layer (it needs the rock and groundwater layers).

Code: `src/model/geography/terrain/shore` (`SHORE`, `SHORE_EXPOSURE`, `SHORE_RELIEF`, `SHORE_MATERIAL`, `SHORE_SETTING`), constants in `src/model/geography/terrain/shore-config`, wave physics in `src/model/climate/ocean/waves` (`OCEAN_WAVES`).

A *coastal land region* is a land region adjacent to open water (`LANDMARKS.openWaterMask`: not land and not a lake landmark; seas count; `LANDMARKS.coastalLandMask`). The wetlands' `touchesSea` uses the same mask.

## Pipeline position

Two stages in `pipelines/post-elevation`:

1. `Post: shore exposure` runs right before `Post: groundwater`. Wetlands read its sheltered-face index as a shelter factor.
2. `Post: shoreline` runs after `Post: hazards`, because black sand needs `hazards.volcano`. It reads exposure, rock, young tag, glaciated mask, ice, rivers, tidal range, the groundwater layers (sand share, wetland kind, coast flag, `wetCoast`) and the hazards.

The world gains optional `shore` layers and `shoreStats`; both go to the UI through the worker transfer list. Nothing else in the world changes except coastal wetland area (see [wetlands](groundwater/wetlands.md#shelter)).

## Exposure

An index in metres, not a forecast. For every open-water cell touching land:

1. Five radials at −45°, −22.5°, 0°, +22.5° and +45° around the wind direction. Each radial is an `OCEAN_WAVES.fetch` walk (upwind great circle, capped at 2000 km). The effective fetch is the Saville weighted mean `ΣF cos²α / Σcos α`.
2. Wave height by `OCEAN_WAVES.height` at a fixed reference wind of 10 m/s with that effective fetch, so the index depends on geometry and wind direction, not on how weak the generated winds are.
3. Twelve monthly winds, weighted by speed². Months with sea ice (perennial ice, or seasonal ice with the cell's monthly temperature at or below −1.8 °C) weigh 0. `Hs_idx = sqrt(Σ w H² / Σ w)`.

A land region takes the **open face** `exposureOpenM` (maximum over its open-water neighbours) and the **lee face** `exposureLeeM` (minimum). Classes: sheltered below 0.6 m, moderate below 1.5 m, exposed above (Hayes 1979 medium wave energy, 0.6 to 1.5 m). Rock, sand and cliffs read the open face; marsh, flats, fjords and the wetland shelter factor read the lee face.

## Relief

Gradient in m/km: the larger of the region's own height over half its sea edge and the steepest rise to a land neighbour. Low below 1 m/km (the groundwater `shoreSlopeMin`), sloping below 10, steep from 10.

## Material

First match wins:

1. **Ice**: land-ice thickness above 0.
2. **Rock**: substrate resistance at least 0.6, relief not low or open exposure at least moderate, and not fresh volcanic on a non-steep coast.
3. **Gravel**: till substrate or steep relief.
4. **Sand with the volcanic flag**: substrate basalt or volcanic with `hazards.volcano` at least 0.25 (fresh volcanic). The flag is set on every non-ice fresh volcanic coast, including those that end up rock or gravel because they are steep; the label is black-sand beach only when the material is sand.
5. **Mud**: sand share under 50% and the open face sheltered or river flow at least 500 m³/s.
6. **Sand**.

## Habitat and setting

- **Habitat** is mangrove or salt marsh when the wetland coast flag is set and `wetCoast` is at least 0.05 (the kind comes from the wetland code), tidal flat when the lee face is not exposed, relief is low, sand share is under 50% and the tidal range is at least 2 m; none on ice.
- **Setting** is delta (low relief, flow at least 500 m³/s), estuary (flow at least 50 m³/s and tidal range at least 2 m) or fjord (glaciated, steep, lee face not exposed).

## Labels

First match wins: ice coast, mangrove coast, salt marsh coast, tidal flat, delta coast, cliff (steep with open face at least moderate), rocky shore, gravel beach, black sand beach, sandy beach, muddy shore.

## Constants

| Constant | Value | Why |
|---|---|---|
| Reference wind | 10 m/s | Storm-scale wind (fully developed sea 2.4 m); keeps the index independent of the generated wind magnitude |
| Exposure edges | 0.6 m, 1.5 m | Hayes 1979 medium wave-energy band |
| Shelter edges | 1.5 m, 2.4 m | Full shelter up to the Hayes medium-energy limit, none at the fully developed sea of the 10 m/s reference wind (0.21 (1.06 U)² / g). The class edges removed too much coast wetland |
| Radials | ±45°, ±22.5°, 0° | Saville effective fetch, USACE *Coastal Engineering Manual* |
| Maximum fetch | 2000 km | Reused from the marine waves |
| Relief low / steep | 1 / 10 m/km | Groundwater `shoreSlopeMin`; steep is a choice |
| Rock resistance minimum | 0.6 | Resistance table in `shore-config` (shield, granite, gneiss 1 down to salt 0.05, unconsolidated 0). Limestone and slate (0.6) count as rock, sandstone (0.55) does not. At 0.5 rock was 48 to 58% of coastal regions, which read as too dominant; 0.6 gives 40 to 50% |
| Sand minimum | 50% | Sand-dominated texture |
| Delta / estuary flow | 500 / 50 m³/s | Estuary reuses the groundwater flood flow |
| Flat tidal range | 2 m | Meso- to macrotidal limit |
| Marsh label share | 0.05 | Visible coastal wetland share |
| Volcanic sand activity | 0.25 | Fresh volcanic substrate near an active volcano |

## Measured

Default procedural world, seeds 14963991, 20251107, 77031 (`SHORE_SHARES=1` runs `src/test/shore/shares.diagnostic.smoke.test.ts`, which writes `stats/shore/<time>-shares`). Shares are of coastal land regions.

| Quantity | Result |
|---|---|
| Coastal land regions | 10.3 to 10.9% of land (6,188 to 6,440) |
| Open face sheltered / moderate / exposed | 9 to 11% / 18% / 71 to 73% |
| Lee face sheltered / moderate / exposed | 22 to 25% / 23 to 25% / 51 to 52% |
| Relief low / sloping / steep | 38 to 45% / 30 to 33% / 25 to 31% |
| Material ice / rock / gravel / sand / mud | 12 to 24% / 40 to 50% / 9 to 12% / 22 to 32% / 3 to 4% |
| Labels: cliff / rocky / sandy / muddy | 19 to 23% / 27 to 34% / 22 to 31% / 2% |
| Delta / estuary / fjord setting | 1.4 to 1.8% / 4.7 to 5.1% / 0.1% |
| Mangrove / salt marsh / tidal flat | 1.1 to 1.2% / 0.5 to 0.9% / 0.5 to 1.1% |
| Volcanic-sand flag / black sand label | 1.3 to 1.8% / 0.02 to 0.13% (1 to 8 regions) |
| Stage time | about 50 to 60 ms (classification only) |

The black-sand label is rare because fresh volcanic coasts are mostly steep at region scale: of 108 coastal regions on fresh volcanic substrate in seed 14963991, 70 are steep and read as cliff, 27 are ice and 8 are black sand beaches. The flag covers the 81 non-ice ones, so hover still reports volcanic sand on a cliff region.

## Not modelled

Swell and distant storms, barrier islands, reefs, beach width, cliff height, longshore drift, and sub-region variety (a region with a cliff and a pocket beach has one label).

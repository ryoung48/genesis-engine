# Wetlands and the marsh label

Scope: terrain generation.

Each ice-free land region gets a wetland share (the part of it that is wet), a wetland kind and a coast flag. The marsh label on the topography map is derived from the share, replacing the old noise-and-bonus rule.

Code: `src/model/geography/terrain/groundwater/wetlands`, `CLASSIFICATION.applyMarsh` in `src/model/geography/terrain/classification`.

## Four causes

Every cause is a share of the region.

| Cause | Share | Condition |
|---|---|---|
| Groundwater | share of the water table within `WET_DEPTH_M` (0.25 m), from [the water table](water-table.md#water-table) | all land. Frost lowers transmissivity, so cold flat wet ground and permafrost lowland are wet; tight rock and clay flats are wet by `T`; flux that surfaces adds to effective recharge |
| Floodplain | `min(FLOOD_MAX_SHARE, w_v / W) · S(0.001, 0.0002, slope)` | river flow at least `FLOOD_M3S` (50 m³/s); `w_v` is the valley width of the riparian band |
| Coast | `min(1, (COAST_SURGE_M + tidalRange) / (max(s, S_SHORE) · W)) · shelter` | region touches open water (the shoreline open-water mask) |
| Lake fringe | `min(1, LAKE_H_M / (max(s, S_SHORE) · W))` | region touches a lake or pan |

The strip causes are lengths in metres over region width, so they scale with the mesh: a region twice as wide has half the coast share for the same strip height and slope. The total is `1 − Π(1 − cause)`, capped at `WET_CAP` (0.95), and set to 0 under `WET_MIN` (0.01). The four causes stay in the output (`wetGw`, `wetFlood`, `wetCoast`, `wetLake`) whatever kind the region ends up with.

### Shelter

`shelter = 1 − smoothstep(1.5, 2.4, exposureLeeM)`, from the sheltered face of the [shoreline exposure](../shoreline.md#exposure). It multiplies the coast cause only: a region whose calmest open-water face is a fully developed sea (2.4 m, the cap at the 10 m/s reference wind) gets no coast wetland, one at or below 1.5 m keeps all of it. The edges are the shelter band, separate from the Hayes classes: with the class edges (0.6 m, 1.5 m) the factor removed too much, because the index is a storm-wind index and half of all lee faces sit at the cap. Measured on the three default seeds, mangrove area fell 34 to 35% (77,000 to 98,000 km² down to 51,000 to 63,000 km²) and coastal salt marsh 31 to 39% (45,000 to 71,000 km² down to 29,000 to 47,000 km²). Mangrove was already under Earth's roughly 0.15 million km² before this stage; reaching it would mean raising the coast cause itself, which this change does not do. The marsh topography label and the other causes barely change. Shore habitat and labels read the result: see [shoreline](../shoreline.md#habitat-and-setting).

## Kinds

Base kind, in this order:

1. **Mangrove**: coast is the largest cause and the coldest month is at least `MANGROVE_COLD_C` (16 °C).
2. **Coastal salt marsh**: coast is the largest cause otherwise.
3. **Inland salt marsh**: a lake fringe beside a salt lake or pan, or `P/E < INLAND_SALT_WET` (0.3) with seepage.
4. **Floodplain**: the floodplain cause is the largest.
5. **Peat bog**: mean temperature under `PEAT_WARM_C` (6 °C) and `P/E ≥ PEAT_WET` (0.8).
6. **Wet meadow**: `P/E` within [0.3, 0.8).
7. **Marsh** (freshwater): everything else.

Forest then replaces the freshwater kinds. If the region's existing vegetation label is forest or jungle, the warmest month is at least `FOREST_WARM_C` (10 °C), `P/E ≥ PEAT_WET`, and the annual mean is above `FOREST_MEAN_C` (−2 °C), peat bog becomes **forested peatland** and marsh, wet meadow and floodplain become **swamp forest**. Mangrove and salt-marsh kinds never change. The coast flag marks mangroves and coastal salt marshes.

These kinds are a region-scale approximation: vegetation is classified for the whole region, not for its wetland, so a region whose upland is forest shows swamp forest on its wetland even where the wet ground itself might be open. The floodplain share stays in `wetFlood` when the kind becomes swamp forest.

## Marsh label

`CLASSIFICATION.applyMarsh({ topography, wetlandShare })` runs right after the groundwater stage and sets marsh on regions labelled flat whose wetland share is at least `MARSH_SHARE` (1/3). A hill, plateau or mountain keeps its label. `classifyTopography` no longer has any marsh code (no noise fields, no `rivers.terminal` rule). Earth imports do not run the stage and so have no marsh.

## Constants

| Constant | Value | Class and reason |
|---|---|---|
| `WET_DEPTH_M` | 0.25 | Literature: Fan et al. 2013's wetland threshold |
| `WET_CAP`, `WET_MIN`, `MARSH_SHARE` | 0.95, 0.01, 1/3 | Choice: a region is marsh when about a third of it is wetland |
| `FLOOD_M3S`, `FLOOD_SLOPE`, `FLOOD_MAX_SHARE` | 50, [0.001, 0.0002], 0.8 | Choice (GFPLAIN, Nardi et al. 2019, as a guide) |
| `COAST_SURGE_M`, `LAKE_H_M` | 1, 0.5 | Choice: height a flat shore floods at beyond tide; lake levels move less |
| `MANGROVE_COLD_C` | 16 | Literature: Osland et al. 2017 |
| `PEAT_WARM_C`, `PEAT_WET`, `MEADOW_WET`, `INLAND_SALT_WET` | 6, 0.8, [0.3, 0.8], 0.3 | Choice (Gallego-Sala and Prentice 2013 as a guide for peat) |
| `FOREST_WARM_C`, `FOREST_MEAN_C` | 10, −2 | Upstream swamp-forest thresholds, kept for both forested kinds |

## Checks

`src/test/groundwater/wetlands.smoke.test.ts` tests each threshold below, at and above its boundary (mangrove cold month, peat warmth and wetness, forest warm month, mean and wetness), that salt kinds ignore forest, the combine formula and its cap and floor, the 1 / width scaling and the marsh rule. The `shares.diagnostic` report gives wetland share and area by kind and by cause, and marsh candidates at the share and a third either side.

Earth comparison, quoted from memory and not checked: wetlands are about 4 to 12% of ice-free land by definition (Fan et al. 2013), about 13% (Lehner et al. 2025) and 21% when regularly flooded plus groundwater-fed (Tootchi et al. 2019). Ours is read against that range in the [overview](overview.md#measured).

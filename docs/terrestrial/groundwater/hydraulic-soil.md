# Hydraulic soil

Scope: terrain generation.

The groundwater stage gives every ice-free land region a soil texture, a depth, a saturated conductivity, an infiltration fraction and a water capacity. It is a separate layer from [soil fertility](../rocks-and-soil.md#soil), which says how rich the ground is; hydraulic soil says how fast water moves through it. Both start from the same rock kinds and the same young-sediment tags, and neither reads the other.

Code: `src/model/geography/terrain/groundwater/{rock-key,hydraulic-soil}`, tables in `groundwater-config`.

## Rock key

Rock kind and young tag collapse to one of 17 keys: young sediment, river, loess, till, dune sand (erg), sandstone, shale, limestone, salt, basalt, volcanic, granite, slate, gneiss, shield, greenstone and ophiolite. Young sediment takes its tag's key, or `young` when untagged. Sea regions have no key.

## Texture

Sand, silt and clay percentages come from a table by key, then shift with climate:

```
clay += CLAY_GAIN · S(1200, 2500, rain) · S(15, 24, mean temp)       (hot and wet weathers to clay)
sand += SAND_GAIN · S(0.3, 0.1, P/E)                                  (dry ground keeps its sand)
```

and renormalise to 100. `S` is the existing `MATH.smoothstep`; `CLAY_GAIN` 15 and `SAND_GAIN` 10 are the pull request's own terms. The base table is Songs of the Eons' soil quality table, mapped to our rock kinds as the pull request maps it (mudstone for shale, basic volcanics for basalt, mixed for andesite, acid plutonics for granite, gneiss and shield, basic plutonics for greenstone and ophiolite). River, loess, till and dune sand textures are set here from typical values: river 20/50/30, loess 15/70/15, till 40/40/20, dune sand 92/4/4.

## Depth

```
D = SOIL_REF_M · Ws / 4.8 / (1 + slope / SOIL_SLOPE)
Ws = (1 + wedge + 0.3 + Pm/100 + 1 + Pm/200) · mass/100 · rate
Pm = rain / 6
wedge = (3 + min(−coldest, warmest)) / 15      when the coldest month is below 0 and the warmest above 0
```

`mass` and `rate` are per-key table values (limestone and salt carry a quarter of the mass; granite, gneiss and shield weather at half rate). Depth halves on glaciated granite, slate, gneiss, shield, greenstone and ophiolite, is at least `YOUNG_SOIL_M` (2 m) on young sediment, and is clamped to [0.1, 3] m. The slope is our mesh-scale slope, which understates hillslope slope, so hills can come out thicker than real ones.

## Conductivity, infiltration and capacity

- Saturated conductivity `Ks = 7.06e-6 · 10^(−0.6 + 0.0126·sand − 0.0064·clay)` m/s (Cosby et al. 1984, with the inch-per-hour constant converted to m/s).
- Infiltration `(0.9·sand + 0.75·silt + 0.1·clay) / 100`.
- Water capacity `AWC_SCALE · (0.25·sand + 0.75·silt + clay) / 100 · min(D, ROOT_M)` mm, with `AWC_SCALE` 200 mm per metre and `ROOT_M` 1.5 m. Nothing in the groundwater stage reads it; it is an output for food and farming later.

`Ks` and depth feed [transmissivity](water-table.md#transmissivity); infiltration feeds [recharge](water-table.md#recharge).

## Constants

| Constant | Value | Class and reason |
|---|---|---|
| texture table | see `GROUNDWATER_CONFIG.texture` | Songs of the Eons (MIT), mapped as above; young tags from typical values |
| `SOIL_REF_M`, `SOIL_MAX_M`, `SOIL_MIN_M`, `YOUNG_SOIL_M`, `SOIL_SLOPE` | 1.2, 3, 0.1, 2, 0.05 | Choice; mesh-scale slope |
| `ROOT_M`, `AWC_SCALE` | 1.5, 200 | Choice |
| `CLAY_GAIN`, `SAND_GAIN` | 15, 10 | Choice: the pull request's weathering terms |

## Checks

`src/test/groundwater/hydraulic-soil.smoke.test.ts`: texture sums to 100 and follows the table, depth stays in its bounds, falls with slope and halves on glaciated hard rock, and `Ks`, infiltration and capacity equal the formulas on 200 sampled regions.

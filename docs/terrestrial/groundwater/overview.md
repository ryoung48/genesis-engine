# Groundwater overview

Scope: terrain generation.

A stage after rocks and soil gives every ice-free land region of a procedural world a hydraulic soil, a recharge, a capacity-limited lateral flux, a distribution of water-table depth, springs, oases, wells and wetlands. It replaces the full Darcy solver in [deferred/groundwater-darcy.md](../../../plans/deferred/groundwater-darcy.md) with closed forms and one cascade sweep, and it is shown in two map modes. Earth imports have none of it. Ice-free here means outside the Pasta Ice climate class: the class needs more than 100 mm of ice and a warmest month whose average daily high is 0 °C or lower, so the land these maps paint white and label Frozen on hover matches the Ice class on the climate map (the rock stage reads the same class). Land that keeps ice all year but has warmer days (Cold Barren, tundra) is therefore modelled, although the ice model, which melts only on monthly means, holds ice there. `iceThickness` is not a test for ice cover: it is only what is left at the end of December, so it also holds northern winter snow.

Details: [hydraulic soil](hydraulic-soil.md), [water table, springs, oases and wells](water-table.md), [wetlands and the marsh label](wetlands.md). Terminal salt lakes and pans, which the stage reads, are in [rivers and lakes](../rivers-and-lakes.md).

## Pipeline position

`Post: shore exposure` runs first (see [shoreline](../shoreline.md#pipeline-position)); its sheltered-face index scales the coast wetland cause. `Post: groundwater` runs in `pipelines/post-elevation` right after it, which is right after `Post: rocks and soil`. It needs the rock kind, young tag and glaciated mask, the final land mask, ice, climate (monthly temperature, PET, annual rain), hydrology (`runoff_annual`, baseflow), rivers, lakes and their `lakeKind`, tidal range and vegetation. It runs before hazards and everything else that reads `topography`, and only when the rocks-and-soil stage ran. The world gains an optional `groundwater` layers object and `groundwaterStats`; both buffers go to the UI through the worker transfer list.

Hydrology's kernel gained one side output, `runoff_annual` (mm): the sum over months of `max(0, rain − AET)`.

## Regions are sub-region distributions

A region is tens of kilometres wide, much larger than a stream, a spring or a marsh. So the stage does not give a region one water-table depth. It gives a distribution: the share of the region within 0.25, 1, 3 and 30 m of the surface, and a mean depth. Shares come from lengths in metres (hillslope half-spacing, a coast strip, a valley width) divided by region width `W = √A`, so they scale with the mesh instead of being tuned to one resolution.

## The cascade in one paragraph

Each region's recharge is split: most stays and feeds its own water table; `REGIONAL_SHARE` (10%) enters flow that passes to the next region down the drain order, limited by Darcy's capacity `T · g · e` of the downstream edge. What cannot pass surfaces as a spring. One sweep, conserving water. It routes by the filled surface, not by head, so it cannot climb or split across a divide, and flat or tight ground passes little; it matters in steep, permeable and karst terrain. See [water table](water-table.md#lateral-flux-cascade).

## Map modes

Water table and Wetlands are sub-modes of Geography → Topography, beside Classification and Slope. They are hidden for Earth imports and worlds without the layers; the other Topography modes stay.

- **Water table** colours the mean depth on a ramp with classes at surface, 0.25, 1, 3, 10, 30 and 100 m. The legend gives land share within 0.25, 1, 3 and 30 m.
- **Wetlands** colours the kind, tinted by wetland share. The legend gives area per kind.
- **Shoreline** is a sibling sub-mode (hidden for Earth imports and worlds without the layer) that colours coastal land by its shoreline label; see [shoreline](../shoreline.md). The legend gives region counts per label; hover shows both exposures in metres, relief, material (with the volcanic flag), habitat and setting.
- **Springs and oases** is a toggle for either mode. It draws one small filled dot per region centre without touching the underlying colours, one colour per kind: four spring classes (seepage, contact, karst, piedmont) and five oasis kinds (river, spring, foothill, fossil, wells). A region with both gets two dots side by side; an oasis in a region with no classified spring gets one dot, and hover says no spring is classified. The dots are approximate regional indicators, not exact sites or counts. The Springs and Oases charts in the world details panel are the legend, with the share of regions per kind.
- **Hover** adds the lake kind (fresh, salt, pan) on lake and pan regions. In the two modes it also shows mean depth, the four shares, recharge, lateral inflow, surfacing, channel recharge, well yield, soil texture and depth and the spring and oasis classes, or the wetland kind with its four cause shares.

## Measured

Three default worlds (seeds 14963991, 20251107, 77031; 204,000 regions), from `shares.diagnostic.smoke.test.ts` (`$env:GROUNDWATER_SHARES = '1'`; about 70 to 100 s). Earth figures are for reading against, quoted from memory and never used in the model.

| Metric | Ours |
|---|---|
| Mean recharge | 98 to 129 mm a year; 14,200 to 18,100 km³ a year in total (Earth: about 12,700, Döll and Fiedler 2008), against hydrology's own baseflow of 10,800 to 13,800 km³ |
| Recharge exported by the cascade | 0.4 to 0.5% (at most 10% by construction), discharged to water bodies 0.1% |
| Land with surfacing flux | 21 to 26% |
| Springs | 1,950 to 2,400 regions: karst 1,270 to 1,490, piedmont 290 to 370, contact 180 to 320, seepage 190 to 420 |
| Oases | regions: river 410 to 830, spring 110 to 230, foothill 240 to 390, fossil 300 to 430, wells 290 to 460 |
| Water table within 0.25 / 1 / 3 / 30 m | 7 to 11% / 12 to 19% / 18 to 29% / 39 to 56% of land |
| Held at the surface | 2.5 to 3.1% |
| Wetland share of land | 7.4 to 11.6% (Earth: 4 to 12% by definition, about 13%, 21% with flooded land) |
| Land regions with wetland share at least 1/3 (at least 2/3) | 3,990 to 6,900 (1,810 to 2,680), before the flat-ground test that makes marsh; the old noise rule's count is not compared, since its code is gone |
| Mangrove / coastal salt marsh area | 0.050 to 0.053 / 0.041 to 0.051 million km² (Earth mangroves: about 0.15 million km², from memory) |
| Stage time | 0.40 to 0.41 s |

Differences from the plan's expectations. The cascade exports far less than the 10% ceiling because flat ground has little capacity (the plan's own estimate for sand at 1 m/km was about 0.02 m³/s against several m³/s of recharge), so surfacing is dominated by karst edges. The first spring-oasis rule, a spring-fed share of 2% of a dry region, needed about 1.6 m³/s of surfacing flux and gave no spring oases on any seed, since the largest dry-region emergence is well under that. A spring oasis is now a dry region whose surfacing flux irrigates at least `SPRING_OASIS_M2` (0.1 km², 10 ha) against its net evaporation, with no spring class required. That alone left hyperarid regions almost bare (1, 24 and 2 spring oases across the three seeds): the cascade passes about 0.5% of recharge and raising `S_MIN` tenfold moved that to only 0.5%, so the cascade, not its gradient floor, limits inflow to deserts. Two local rules were added instead (mountain-front supply and fossil-aquifer depressions, see [water table](water-table.md)); `REGIONAL_SHARE` stays at 0.1. Wetland share sits inside the plan's 5 to 20% range on all three seeds, with seed 14963991 at the upper end because it has the most cold flat wet land (peat bog and forested peatland 9.3 million km²).

## Not modelled

A head-driven flow solver, deep and fossil aquifers, groundwater abstraction effects on rivers, per-crop water supply, wetland vegetation distinct from its region's, seasonal flooding, and salinity beyond inland salt marsh and pans.

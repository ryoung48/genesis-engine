# Deposit systems and commodities

Scope: terrain generation. Part of the [deposits overview](overview.md).

The stage stores 48 systems as byte rows and derives 18 commodities from them. A system is one way ore, fuel, stone or a gem forms. Each is a potential from the geologic record (where and how long ago it formed, how much has worn away), times a host gate (the rock at the surface), times a district noise (see [districts](districts.md)), times the system's `scale`. Constants are in `src/model/geography/terrain/deposit-config/index.ts`; the catalogue rows are in `deposits/systems` and `deposits/commodities`.

Ages use the present as 0, so an active belt has `oroLast` 0 and the older times are negative. A deposit loses half its potential every half-life, `0.5^(age / half-life)`, with ages capped at `historyMyr` 2000 Myr (the age of the craton cores). A window `windowKm` rises from 0 as erosion bares a deposit's top depth and falls to 0 as it wears past its bottom depth.

## Metals

| System | Rule | Constants |
|---|---|---|
| porphyry | arc crust that has been worn 0.8 to 5.5 km; richer where the arc has run 2 to 24 Myr and the crust is thick | half-life 160 Myr |
| epithermal | young arcs only, gone once erosion takes about 1 km | half-life 25 Myr; `scale` 0.65 |
| orogenicGold | collision belts and sutures, older than 30 to 70 Myr, bared 2 to 18 km | half-life 450 Myr; `scale` 0.8 |
| vms | arcs and ophiolites, docked onto land, not too deeply exhumed | half-life 500 Myr |
| skarn | granite meeting carbonate, in or beside a belt | half-life 200 Myr; `scale` 1.6 |
| mvt | carbonate cover over 0.2 km, best in forelands, thin cover over basement highs | half-life 300 Myr; `scale` 1.25 |
| sedex | rift basins and rift margins under thick, organic cover | half-life 600 Myr |
| tin | thick collision crust far inboard, and Andean belts far from the trench | half-life 300 Myr; `scale` 1.6 |
| iocg | craton edges reworked by a later belt or plume, and Andean belts | half-life 800 Myr; `scale` 0.9; the edge is the craton share over about 150 km between 0.15 and 0.9 |
| magmatic | worn flood basalts crossing a craton edge | edge floor 0.2 |
| nativeCopper | flood basalt that filled a rift | |
| greenstoneGold | a craton's greenstone, by terrane endowment | |
| bif | banded iron on 70% of cratons, in the greenstone keel or a craton-edge basin | |
| reef | one craton per world, in spots 500 km apart | `reefKm` 500 |
| ironVein | any belt, carbonate and slate hosts | half-life 700 Myr |
| ioa | the front of volcanic arcs | half-life 400 Myr |

## Fuels

| System | Rule | Constants |
|---|---|---|
| oil | organic cover buried into the oil window (55 to 75 °C, falling above about 190 °C), trapped and sealed, kept for about 180 Myr (longer under salt), less where later erosion removed the cover | trap term fixed at its midpoint, `OIL_ARCH` 0.5, giving 0.35 + 0.65 · 0.5 of potential; `scale` 1.4 |
| gas | deeper than oil (120 to 155 °C), or from coal | `scale` 1.4 |
| bitumen | an oil basin lifted and opened, plus oil shale where the cover is thin | outcrop term `min(1, 0.6 km / cover)` for shale; `scale` 1.2 |
| coal | coal facies in a basin, outcropping where the coal measures (the top 1.2 km of cover) reach the surface | `min(1, 1.2 km / cover)`; `scale` 1.3 |

Offshore oil and gas are deliberately boosted and do not follow upstream. The boost values are our own choices for map coverage, with no outside source.

| Rule | Upstream | Ours |
|---|---|---|
| Depth limit (`shelfKm`) | 0.25 km | 2 km |
| Eligible crust | the region's own cell is not oceanic | any region, reading its own cell or the nearest non-oceanic one |
| Record | `oil`, `gas` | `shelfOil`, `shelfGas`, on shelf, epeiric and rift-margin cells only |
| Eroded-cover penalty | applied | left out |
| District noise | full | `0.8 + 0.2 ·` district value (`shelfDistrictFloor` 0.8) |
| Gain | none beyond the system scale | `shelfGain` 2, times the system scale |

Offshore regions get oil and gas only. Coverage on ocean regions shallower than 2 km, for the oil and gas commodity:

| Seed | Shallow regions | Poor or richer | Moderate or richer | Rich |
|---|---|---|---|---|
| 14963991 | 18,662 | 1,665 | 817 | 475 |
| 20251107 | 18,343 | 1,043 | 566 | 346 |
| 77031 | 17,186 | 1,503 | 820 | 488 |

Above the poor grade, an offshore value is compressed to `0.15 + 0.4 · (value − 0.15)` before it is capped at 1 (`shelfStretch` 0.4), which keeps offshore finds in about the same grade mix as land: pooled over the three seeds, 4,080 offshore regions (7.5% of shallow ocean) are poor or richer, split 71% poor, 22% moderate and 6% rich, against 75, 19 and 6% on land. The per-seed table above was measured before this compression, which lowers the grades and barely changes the count. With upstream's rules (own non-oceanic cell, `oil` and `gas` records, full district noise, no gain) the same seeds give 80, 59 and 98 regions at 0.25 km, and 131, 87 and 145 at 2 km.

## Weathered and surface deposits

| System | Rule |
|---|---|
| ironLaterite | warm, wet and gently sloped ground, in a weathered crust, on iron-rich rock, less where the bauxite test is high |
| supergene | a copper source (porphyry, vms or skarn) under a warm, dry sky, less where ground is steep or iced |
| gossan | the weathered cap of any sulfide system, cut under ice and on young cover |
| placerGold, placerTin, placerDiamond | their sources carried down the drainage order as `exp(−step/L)` with `L` gold 150 km, tin 120, diamond 250; gated by river discharge between 250 and 2,000 m³/s, gentle ground and ice (0.15 under present ice, `1 − 0.4 · till` at the margin) |
| salt | the richest of: terminal salt lakes and pans, old salt beds bared, and evaporite flats in the lowest dry pans; salt lakes are non-land regions and are written too |
| ironstone | iron oolites of old warm shallow seas, `IRONSTONE_OUTCROP` 0.2 of the bed outcropping |
| bogIron | wet, low, sandy ground, or till |
| opal | arid, gentle, weathered sandstone and volcanic ground |
| turquoise | a copper source under a desert sky |
| sand | on an erg region, 0.2 to 0.8 by a smooth noise (`sandErg`); or 0.75 (`sandBeach`) times the ramp of sand share from 50 to 80% on a coastal land region; the larger of the two; 0 under present ice |

## Gems

| System | Rule |
|---|---|
| kimberlite | pipe fields about 40 km across, 260 km apart, on the 60% of cratons that are ancient, 55% of those carrying diamonds |
| pegmatite | collision-belt granite, gas-rich last melts |
| emerald | pegmatite cutting ophiolite or greenstone, or fold-belt black shale |
| corundum | marble baked in a collision belt |
| lapis | marble touched by granite |
| basaltGems | hotspot-track basalt on a continent |
| amethyst | geodes in a flood basalt |
| garnet | gneiss, slate and shield: the commonest gem |
| gemPlacer | gems carried down rivers from their sources, `L` 150 km; `scale` 2 |

## Rock-derived

Building stone is one system, `stone`: a rock share (the sum of the stone rock kinds, none of which is shale, salt or young sediment) times an access term (`0.6 + 0.4 · hills`, 0 on young sediment, cut by deep weathering, 1.25 times on ice-scoured ground) times a quarry term from its district noise. `stoneMarble` is the baked limestone share. `clay` is `1.1 · young + 0.6 · shale`, cut by hills (`clayHills` 0.5), times `clayGain` 0.7, times a smooth noise between 0.45 and 1 (`clayVariety` 0.55).

Four more are our own rules, each with a trade good that has no other source:

| System | Rule |
|---|---|
| alum | acid-altered volcanic ground (weight 0.8) or black alum shale (0.6) |
| mercury | volcanic, ophiolite and slate ground with epithermal potential |
| saltpeter | arid test, limestone or young sediment, none under ice |
| amber | coaly facies on a coastal land region |

## Commodities

Not stored. `COMMODITIES.richness` computes one from a region's stored bytes as `min(1, max + 0.15 · (sum − max))` over its weighted sources. Grades are poor 0.15, moderate 0.4, rich 0.7.

| Commodity | Sources (weight 1 unless given) |
|---|---|
| iron | bogIron, ironstone, ironLaterite, bif, ironVein, ioa; iocg 0.7; skarn 0.5 |
| copper | porphyry, supergene; vms 0.8; skarn 0.6; nativeCopper 0.9; iocg 0.6; magmatic 0.4 |
| gold | orogenicGold, epithermal, placerGold, greenstoneGold, reef; porphyry 0.2; iocg 0.3; gossan 0.3; vms 0.15 |
| silver | epithermal 0.9; sedex 0.85; gossan 0.85; vms 0.4; supergene 0.4; mvt 0.25 |
| tin | tin, placerTin |
| leadZinc | mvt, sedex; vms 0.6; skarn 0.4 |
| salt, coal | the system of the same name |
| oilGas | oil; gas 0.9; bitumen 0.6 |

Added here and not upstream's: stone, marble, clay, sand, alum, mercury, saltpeter, amber, and gems (pegmatite, emerald, corundum, lapis, basaltGems, amethyst, opal, turquoise, gemPlacer, kimberlite and placerDiamond at 1; garnet at 0.25 so the commonest gem does not hide the rare ones).

Each commodity has one colour, used by the dropdown swatch, both map views and hover. A poor region is tinted 35% of the way from the ground colour to it, rising to the full colour at rich.

## Not ported from upstream

Nine upstream systems are not here, because no trade good reads them: layered intrusion, nickel laterite, bauxite as a deposit (the bauxite test stays as an input to iron laterite), peat (the peat test stays as an input to bog iron), wood, and the four tool stones (flint, obsidian, jade, agate). Upstream's five building-stone systems are one here, and its `stoneSlate` and `stoneVolcanic` fold into it.

## Deviations from the research plan

- No prehistoric-belt branches: the record's belts are the ones that survive, so porphyry and iocg read only the present record.
- The bauxite host table is dropped; bauxite only reduces iron laterite.
- Gas gets a deep-basin term from the present cover thickness (`coverNow` 1.5 to 4 km), since no structure field exists.
- Shale is the organic potential, ramped between 0.02 and 0.15.
- Salt is also written on lake regions that are not land.
- Bed terms replace upstream's rock column: coal, oil shale and ironstone use outcrop shares, oil and gas the trap midpoint.
- The placer discharge gate is `[250, 2000]` m³/s, not upstream's `[1, 15]`, which assumes its own discharge field.
- Placers have no river-band share, and their reach is longer than upstream's (see [grade tuning](#grade-tuning)).

## Calibration sweeps

Percent of land regions at poor or richer, three seeds (14963991, 20251107, 77031), from `sweeps.diagnostic.smoke.test.ts`.

| Knob | Setting | Result |
|---|---|---|
| `PLACER_Q` | [250, 2000], [1000, 4000], [4000, 8000] | Placer systems are at 0.00 to 0.02% of land at every setting, so the gate is not what limits them; the gold, tin and gem commodities move by under 0.02 points |
| `IRONSTONE_OUTCROP` | 0.1, 0.2, 0.4 | Ironstone 0.13 to 0.26% at 0.1 and 0.2, 2.8 to 3.2% at 0.4; iron commodity 10.3 to 15.6% at 0.1, 10.5 to 15.8% at 0.2, 12.9 to 18.4% at 0.4 |
| `SAND_COAST` | [40, 70], [50, 80], [60, 90] | Sand 5.3 to 7.2% across the range; 4.9 to 6.5% at the chosen [50, 80] |
| `OIL_ARCH` | 0.3, 0.5, 0.7 | Oil and gas 3.7 to 5.0% at 0.3, 4.0 to 5.5% at 0.5, 4.3 to 6.0% at 0.7 |

The sweeps were run at the plan's constants, before the later tuning (`IRONSTONE_OUTCROP` is now 0.4). The placer rows predate the placer change below.

## Grade tuning

These values are our own choices, made by measuring the three seeds, with no outside source.

- **Grade stretch** (`gradeStretch`): after the system scale, the part of a value above the poor grade 0.15 is multiplied, then capped at 1. Where a system appears does not change, only its grades: mvt 2.2, ioa 4, stoneMarble 1.8, epithermal 1.7, coal 1.5, sedex 1.4, gossan 1.3. These were mostly or wholly stuck at poor.
- **Magmatic ore**: the record needs a worn flood basalt. Ours are barely worn (at most 8% of their thickness, usually about 3%), so the ramp is `magmaticWorn` 0 to 5% of thickness, not 15 to 60%, with `scale` 3. Before this, magmatic ore appeared nowhere.
- **Placers**: a region is about 50 km wide. With a 20 to 60 km reach and a band share of `2 · 7 km / 50 km`, gravels almost never reached the poor grade. The band share is gone and the reach is gold 150 km, tin 120, gems 150 and diamond 250.
- **Scarce systems**: tin `scale` 2.2 (was 1.6), lapis `scale` 2.5.- **Sand and clay** vary by noise instead of saturating (see the rules above), and silver weights sedex and gossan at 0.85 (was 0.6).

poor grade of 0.15.

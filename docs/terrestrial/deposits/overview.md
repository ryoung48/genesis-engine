# Mineral deposits

Scope: terrain generation, procedural worlds only (Earth imports skip the stage). Detail: [systems](systems.md), [districts](districts.md).

## Pipeline position

`Post: deposits` runs after `Post: groundwater` in `src/model/pipelines/post-elevation/index.ts`. `DEPOSITS.compute` (`src/model/geography/terrain/deposits/index.ts`) returns `GenesisDeposits { rows, shares, landRegions }`. `rows` is a `Uint8Array(48 × numRegions)` indexed `k * numRegions + region`, richness × 255, and its buffer is transferred from the genesis worker. Commodities are computed from the rows, not stored.

## Layers

1. **Record potential**: the geologic record's crust raster per system, blurred onto the sim mesh and sampled per region ([tectonics record](../tectonics-record.md)).
2. **Host gate**: the region's rock (one-hot tables in `deposits/hosts`), climate and ground tests, drainage for placers.
3. **District noise**: clustered, lineament-aligned shapes that put deposits in fields rather than everywhere ([districts](districts.md)).

Regions carry byte richness; grades are poor 0.15, moderate 0.4, rich 0.7. Shelf regions (ocean no deeper than 2 km, with boosted values; see [systems](systems.md)) get oil and gas only; salt-lake and pan regions get salt.

## Map modes

Geology mode has a Deposits view, a dense dropdown of commodities with a colour swatch beside each name: all (the strongest ore, fuel, mineral or gem in each region, each in its commodity's colour) or one commodity. No colour is white. Ocean shelf regions with oil and gas are painted over the sea, and salt-lake regions with salt over the lake colour. There is no legend; hover lists the commodities present and, for multi-source commodities, their systems. Province aggregates (`PROVINCE_DEPOSITS.aggregate`, `src/model/society/province-deposits`) give area-weighted richness and the area share at moderate or richer per commodity; nothing consumes them yet.

## Measured shares

Pooled over three default worlds (seeds 14963991, 20251107, 77031). The first number is the percent of land regions at poor or richer; the second is the grade mix of those regions as poor / moderate / rich percent.

| Commodity | Land | Grade mix | Commodity | Land | Grade mix |
|---|---|---|---|---|---|
| iron | 21.5 | 77/19/4 | stone | 48.6 | 56/37/8 |
| copper | 1.8 | 72/19/10 | clay | 38.5 | 74/21/5 |
| gold | 1.7 | 72/22/6 | marble | 1.6 | 80/18/2 |
| silver | 3.2 | 70/21/8 | sand | 5.8 | 27/53/20 |
| tin | 0.18 | 74/19/7 | alum | 1.2 | 70/23/7 |
| leadZinc | 2.8 | 77/18/4 | mercury | 0.22 | 34/45/21 |
| salt | 3.9 | 51/26/23 | saltpeter | 1.2 | 50/39/11 |
| coal | 4.7 | 74/21/5 | amber | 0.11 | 66/26/8 |
| oilGas | 4.7 | 75/19/6 | gems | 1.7 | 80/16/4 |

Offshore oil and gas: 7.5% of ocean regions shallower than 2 km, grade mix 71/22/6. Grade mixes are rounded.

The stage takes about 2.1 s on a default world (measured on seed 77031 before the tuning).

## Against the plan's expectations

- Every commodity with an estimate is in range except copper (1.8% against 2 to 6%): the record has little volcanic rock, so only about 1.5% of regions have nonzero porphyry.
- Getting there took higher scales for several metal systems, `IRONSTONE_OUTCROP` 0.4, building-stone `gain` 0.8 and `quarry` 0.8, and the [grade tuning](systems.md#grade-tuning).
- Placers now show: gold gravels on 0.22% of land, tin 0.06%, diamond 0.09% and gem gravels 0.23%. Lapis is still very scarce (59 regions across the three seeds).
- Runtime is about 2 s, not the 0.2 to 0.5 s estimated.

The sweeps in [systems](systems.md#calibration-sweeps) predate the tuning and were run at the plan's constants.

## Not modelled

Consumers of the deposits (trade, mining economy), deposit ages, beds and lithology relief, and depletion.

Diagnostics: `DEPOSIT_SHARES=1` and `DEPOSIT_SWEEPS=1` with `pnpm vitest run --project smoke src/test/deposits/<name>.diagnostic.smoke.test.ts` write reports under `stats/deposits/`.

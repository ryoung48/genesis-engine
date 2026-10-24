# Climate v2 surface pressure

`GenesisParams.pressure` (bar) reaches climate v2 as `ClimateOrbit.pressureScale` (`CLIMATEV2_ORBIT.fromParams`), held to 0.1–10 bar, ExoPlaSim's usable range. At 1 bar every stage computes exactly what it did before.

## Scalings

`src/model/climatev2/vendor/pressure.js` holds the constants and their sources; the stages apply them:

| What | Scaling | Where |
| --- | --- | --- |
| Air column heat capacity (land heat capacity, wind heat carry, day cycle) | ∝ ps | `pressureScaled`, `temperature.js`, `diurnal.js` |
| Poleward heat spread | ∝ √(0.6·ps + 0.4): dry part ∝ ps, latent part independent of p | `pressureScaled` |
| Greenhouse (OLR intercept) | −25 · (1 − ps^−0.3) / 0.3 W/m² | `pressureScaled` |
| Clear-sky Rayleigh albedo | Eddington reflectance, τ = 0.07·ps | `rayleighReflect`, `temperature.js` |
| Surface wind speed | ∝ ps^−0.13 | `windScale`, `circulation.js` |
| Wind stress on the ocean | air density ∝ ps | `ocean.js` |
| Psychrometric constant (evaporative share Δ/(Δ+γ)) | ∝ ps | `rain.js`, `temperature.js`, `diurnal.js` |
| Mean sea-level pressure | 1011 hPa · ps | `circulation.js` |

## Reference

Worldbuilding Pasta 2025, "Climate Explorations: Pressure" (ExoPlaSim, Earth's terrain, N₂ varied). At that article's 15 °C-holding starlight the `surface pressure (bar), ExoPlaSim's sunlight` rows of `src/test/earth/climatev2-orbit-sweep.diagnostic.smoke.test.ts` give:

| bar | Global T (°C), ours / ExoPlaSim | Precipitation vs 1 bar, ours / ExoPlaSim |
| --- | --- | --- |
| 0.1 | 17.1 / 15.9 | 200 % / 200 % |
| 0.25 | 17.5 / 14.1 | 161 % / 145 % |
| 0.5 | 14.3 / 14.1 | 113 % / 117 % |
| 2 | 15.2 / 15.3 | 79 % / 81 % |
| 4 | 14.6 / 14.5 | 64 % / 61 % |
| 10 | 13.0 / 15.6 | 49 % / 42 % |

Thick air damps the seasons and the day's range (40–70°N land seasonal range 29 °C at 1 bar, 9.7 °C at 10 bar) and evens the equator-to-pole contrast (45 °C → 18 °C). Thin air sharpens both and grows larger ice caps, as in ExoPlaSim. Two known departures: below 0.25 bar the contrast keeps widening (84 °C at 0.1 bar), where ExoPlaSim's flattens; and boiling at low pressure (≈ 45 °C at 0.1 bar) is not modelled. Run the sweep with `SWEEP_KNOBS="surface pressure"`.

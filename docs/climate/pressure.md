# Climate v2 surface pressure

`GenesisParams.pressure` (bar) reaches climate v2 as `ClimateOrbit.pressureScale` (`CLIMATEV2_ORBIT.fromParams`), held to 0.1–10 bar, ExoPlaSim's usable range. At 1 bar every stage computes exactly what it did before.

## Scalings

`src/model/climatev2/vendor/pressure.js` holds the constants and their sources; the stages apply them:

| What | Scaling | Where |
| --- | --- | --- |
| Air column heat capacity (land heat capacity, wind heat carry, day cycle) | ∝ ps | `pressureScaled`, `temperature.js`, `diurnal.js` |
| Poleward heat spread | ∝ √(0.6·ps + 0.4): dry part ∝ ps, latent part independent of p | `pressureScaled` |
| Greenhouse (OLR intercept) | −26.5 · (1 − ps^−0.3) / 0.3 W/m² | `pressureScaled` |
| Heat to space in the cold | never above a black body's σ·T⁴ (the line passes it below ≈ −15 °C at 0.1 bar) | `temperature.js` (`forcingSweep`) |
| Locked day–night heat transport | ∝ ps, dry only (the dayside's water rains out in the substellar convection) | `lockedDiffusivity`, `temperature.js` |
| Clear-sky Rayleigh albedo | Eddington reflectance, τ = 0.07·ps | `rayleighReflect`, `temperature.js` |
| Surface wind speed | ∝ ps^−0.13 | `windScale`, `circulation.js` |
| Wind stress on the ocean | air density ∝ ps | `ocean.js` |
| Psychrometric constant (evaporative share Δ/(Δ+γ)) | ∝ ps | `rain.js`, `temperature.js`, `diurnal.js` |
| Mean sea-level pressure | 1011 hPa · ps | `circulation.js` |

## Reference

Worldbuilding Pasta 2025, "Climate Explorations: Pressure" (ExoPlaSim, Earth's terrain, N₂ varied). At that article's 15 °C-holding starlight the `surface pressure (bar), ExoPlaSim's sunlight` rows of `src/test/earth/climatev2-orbit-sweep.diagnostic.smoke.test.ts` give:

| bar | Global T (°C), ours / ExoPlaSim | Precipitation vs 1 bar, ours / ExoPlaSim |
| --- | --- | --- |
| 0.1 | 16.8 / 15.9 | 194 % / 200 % |
| 0.25 | 15.1 / 14.1 | 144 % / 145 % |
| 0.5 | 13.1 / 14.1 | 107 % / 117 % |
| 2 | 15.7 / 15.3 | 81 % / 81 % |
| 4 | 15.4 / 14.5 | 67 % / 61 % |
| 10 | 14.3 / 15.6 | 52 % / 42 % |

Thick air damps the seasons and the day's range (40–70°N land seasonal range 29 °C at 1 bar, 9.7 °C at 10 bar) and evens the equator-to-pole contrast (45 °C → 18 °C). Thin air sharpens both and grows larger ice caps, as in ExoPlaSim. Two known departures: below 0.25 bar the contrast keeps widening (82 °C at 0.1 bar), where ExoPlaSim's flattens; and boiling at low pressure (≈ 45 °C at 0.1 bar) is not modelled. Run the sweep with `SWEEP_KNOBS="surface pressure"`.

## Tidally locked planets

`src/test/earth/climatev2-locked-budget.diagnostic.smoke.test.ts` sweeps a locked Earth (365-day orbit, no tilt) over the same pressures and reports the global, dayside and nightside means, the day–night contrast, sea ice, the albedo by part and the global energy balance. `LOCKED_PRESSURES` picks the pressures; `LOCKED_EXOPLASIM_SUN=1` runs each at ExoPlaSim's 15 °C-holding starlight (the locked planet's monthly flux table scaled with `sunScale`).

The locked solve is deflated (`HelmholtzSolver.solve`'s `deflate`): its day–night transport is many times the radiative damping, and plain V-cycles barely moved the planet's mean, so the cloud pass stopped with the budget 24–36 W/m² out of balance and up to 18 °C too warm (the old 32–33 °C plateau above 2 bar). Each V-cycle now sets the mean exactly; the budget closes to within 1.4 W/m².

| bar | Earth's starlight: global / day–night (°C) | ExoPlaSim's starlight: global / day–night / substellar / antistellar (°C) |
| --- | --- | --- |
| 0.1 | −63.9 / 13.6 (snowball, 99 % sea ice) | 6.4 / 36.0 / 51.7 / −21.5 (52 % sea ice) |
| 0.25 | −2.6 / 13.2 | 6.7 / 13.9 / 23.8 / −4.3 |
| 0.5 | 6.2 / 6.6 | 9.2 / 6.7 / 17.3 / 3.9 |
| 1 | 11.8 / 3.2 | 11.8 / 3.2 / 15.7 / 9.2 |
| 2 | 15.5 / 1.6 | 12.7 / 1.5 / 14.6 / 11.5 |
| 4 | 17.3 / 0.8 | 13.2 / 0.7 / 14.1 / 12.6 |
| 10 | 16.7 / 0.3 | 13.3 / 0.3 / 13.6 / 13.0 |

At Earth's starlight 0.1 bar freezes over, as the rotating planet does (−70.9 °C); the day–night contrast there is the ice's, not the transport's. The nightside's land and frozen sea lie under a stable surface layer (`darkGround`, `temperature.js`): the dark ground gets the air's back radiation, Earth's 333 / 396 W/m² (Trenberth et al. 2009) scaled by the greenhouse's share of the surface's emission (1 − OLR/σT⁴, so it follows the pressure's greenhouse), and the heat the layer brings down, ρ·c_p·C_H·U with C_H = 1.5 × 10⁻³ (Garratt 1992) and U = `TEMP_INVERSION_WIND`. It replaces the snow inversion on locked worlds. Like that inversion it sets the reported temperature over land, not the energy balance; the open sea keeps the air's temperature.

| bar | Nightside land below the air (°C), Earth's / ExoPlaSim's starlight | Land day / night (°C), ExoPlaSim's starlight |
| --- | --- | --- |
| 0.1 | 36.6 / 68.3 | 22.3 / −75.4 |
| 0.25 | 29.9 / 26.1 | 12.6 / −24.5 |
| 0.5 | 12.5 / 12.1 | 12.0 / −5.3 |
| 1 | 4.7 / 4.7 | 13.2 / 5.9 |
| 2 | 1.1 / 1.3 | 13.5 / 10.9 |
| 4 | 0 / 0 | 13.6 / 12.9 |
| 10 | 0 / 0 | 13.4 / 13.2 |

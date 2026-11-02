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

Weak-gradient transport keeps the air column nearly even across the planet; each surface beneath it is set by its own balance (`lockedSurface`, `temperature.js`), solved as σT_s⁴ − σT_a⁴ + k·(T_s − T_a) = rhs (`groundBalance`):

- Sunlit ground and the open sea, by day and by night (stirred from below), convect: rhs is the sunlight the surface takes beyond the planet's mean, and k the surface layer's heat ρ·c_p·C_H·U plus, where wet, evaporation ρ·L·C_H·U·dq_s/dT (independent of the pressure). C_H = 1.5 × 10⁻³ (Garratt 1992), U = 22 km/h × `windScale` (ExoPlaSim's Earth mean), land half as wet as the sea.
- Dark land and sea ice lie under a stable layer (`darkGround`): rhs = −(1 − ε)·σT_a⁴, with ε Earth's back radiation (333 / 396 W/m², Trenberth et al. 2009) scaled by the greenhouse's share of the surface's emission (1 − OLR/σT⁴), and k = ρ·c_p·C_H·`TEMP_INVERSION_WIND`. It replaces the snow inversion on locked worlds.

Snow and sea ice follow the surface's temperature, and the surface's departure from the air reaches space through the window, (1 − ε)·σ·((T_a + δ)⁴ − T_a⁴), in the energy balance, so the budget stays closed. The offsets are relaxed by half each round; 12 rounds (10 warm-started) close every pressure to within 0.9 W/m² (≈ 16 s per locked world on the Earth fixture, rain, winds and ocean included).

| bar | Earth's starlight: global / dayside / nightside / substellar / antistellar (°C), sea ice | ExoPlaSim's starlight: the same | ExoPlaSim's starlight: land day / night (°C) |
| --- | --- | --- | --- |
| 0.1 | −22.2 / 18.6 / −63.1 / 39.8 / −72.2, 58 % | 14.7 / 47.7 / −18.4 / 73.9 / −45.5, 42 % | 47.3 / −24.5 |
| 0.25 | −9.9 / 11.6 / −31.3 / 26.6 / −35.1, 59 % | 8.6 / 23.8 / −6.6 / 37.3 / −21.5, 33 % | 24.8 / −14.6 |
| 0.5 | 0.6 / 12.8 / −11.6 / 24.3 / −13.8, 55 % | 6.9 / 15.3 / −1.6 / 27.1 / −8.1, 12 % | 16.9 / −7.5 |
| 1 | 8.9 / 14.4 / 3.5 / 23.3 / 2.5, 0 % | 8.9 / 14.4 / 3.5 / 23.3 / 2.5, 0 % | 15.9 / 2.5 |
| 2 | 13.6 / 16.9 / 10.3 / 23.3 / 9.9, 0 % | 10.2 / 13.9 / 6.6 / 19.9 / 6.1, 0 % | 15.1 / 8.0 |
| 4 | 16.0 / 17.9 / 14.0 / 22.2 / 13.8, 0 % | 11.3 / 13.6 / 9.0 / 17.3 / 8.8, 0 % | 14.5 / 10.8 |
| 10 | 15.9 / 16.9 / 15.0 / 18.9 / 14.9, 0 % | 12.1 / 13.2 / 11.0 / 14.8 / 10.9, 0 % | 13.6 / 11.9 |

At Earth's starlight thin air no longer freezes over: the substellar sea convects warm enough to stay open (an eyeball), where the even-surface model froze 0.1 bar solid. These figures predate the ocean heat (below), which moves 30–45 W/m² to the nightside's seas; at Earth's starlight they still freeze from 0.5 bar down.

### Rain

The locked rain stage (`src/model/climatev2/rain/locked`) runs after the cloud pass, on the climate grid; cells take it through the same sampler as the temperature (rain by height and texture included), and `post-elevation` uses it for every locked world. The sea evaporates by the rotating stage's bulk formula (`RAIN_EVAP_COEFF`, `RAIN_SURFACE_RH`) at the planet's mean surface wind (`surfaceWind`, `pressure.js`), none under sea ice; land at the Priestley–Taylor rate of its surface's net radiation, limited by the rain that reaches it (Turc–Pike). Under the even air the column rises where the surface heats it more than the planet's mean (the sunlight the surface takes beyond its mean, as in `lockedSurface`), and all the planet's evaporation rains out there in proportion; the subsiding nightside stays dry.

| bar | Earth's starlight: global / substellar / land (mm/yr) | ExoPlaSim's starlight: global / substellar (mm/yr), vs 1 bar |
| --- | --- | --- |
| 0.1 | 495 / 2633 / 715 | 1760 / 13257, 374 % |
| 0.25 | 321 / 1667 / 467 | 669 / 4181, 142 % |
| 0.5 | 308 / 1636 / 460 | 456 / 2736, 97 % |
| 1 | 471 / 2743 / 730 | 471 / 2743, 100 % |
| 2 | 551 / 3464 / 885 | 460 / 2532, 98 % |
| 4 | 546 / 3614 / 925 | 428 / 2247, 91 % |
| 10 | 432 / 2809 / 849 | 347 / 1709, 74 % |

The trend with pressure follows ExoPlaSim's rotating one in direction (more in thin air, less in thick), steeper below 0.5 bar: there the substellar sea runs past its boiling point (≈ 46 °C at 0.1 bar), which is not modelled. No moisture reaches the nightside yet.

### Winds and ocean

Locked winds and currents are derived from the finished climate (`CLIMATE_V2.computeLocked`) and do not feed back into it: the day–night transport is the energy balance's own.

- Winds (`src/model/climatev2/circulation/locked`): the surface air flows in to the ascent, u = ∇φ with ∇²φ = −(S − S̄) (the rain stage's driver), scaled so its mean speed is the planet's mean surface wind (`surfaceWind`). Sea-level pressure is the thermal low: 1013.25 hPa × ps less half the surface's warming over the planet's mean, as a share of its kelvin temperature.
- Currents (`src/model/climatev2/ocean/locked`): with almost no Coriolis force the surface drifts downwind toward the substellar point at 3 % of the wind (Wu 1983).
- Ocean heat: in the surface balance (`lockedSurface`), the sea's departure from the sea's mean sunlight is reduced by 0.35, Earth's ocean share of the poleward heat transport at 20° (Trenberth & Caron 2001), and that heat is given to the seas the sun heats least, so it sums to zero over the sea. It moves 30–45 W/m² from the dayside's seas to the nightside's (1 bar: substellar 23.3 → 19.4 °C, antistellar 2.5 → 3.6 °C; 0.5 bar at ExoPlaSim's starlight: sea ice 12 % → 1.5 %). The share is an analogue, not a locked-ocean result: dynamic-ocean studies of locked planets (Hu & Yang 2014) find the ocean opens much of the nightside's sea, more than this does at Earth's starlight (0.5 bar: 49 % sea ice).

The rotating ocean stage (`windDrivenOcean`) is not used: its gyres and Ekman transport are set by the Coriolis force, which a locked planet's year-long day all but removes.

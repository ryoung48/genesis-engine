# Climate v2 surface pressure

`GenesisParams.pressure` (bar) reaches climate v2 as `ClimateOrbit.pressureScale` (`CLIMATEV2_ORBIT.fromParams`), held to 0.1–10 bar, ExoPlaSim's usable range. At 1 bar every stage computes exactly what it did before.

## Scalings

`src/model/climatev2/vendor/pressure.js` holds the constants and their sources; the stages apply them:

| What | Scaling | Where |
| --- | --- | --- |
| Air column heat capacity (land heat capacity, wind heat carry, day cycle) | ∝ ps | `pressureScaled`, `temperature.js`, `diurnal.js` |
| Poleward heat spread | ∝ √(0.6·ps + 0.4): dry part ∝ ps, latent part independent of p | `pressureScaled` |
| Greenhouse (OLR intercept) | −25 · ln ps W/m² above 1 bar, −25 · (1 − ps^−0.3) / 0.3 below | `pressureScaled` |
| Heat to space in the cold | never above a black body's σ·T⁴ (the line passes it below ≈ −15 °C at 0.1 bar) | `temperature.js` (`forcingSweep`) |
| Locked day–night heat transport | ∝ ps, dry only (the dayside's water rains out in the substellar convection) | `lockedDiffusivity`, `temperature.js` |
| Rayleigh albedo | Eddington reflectance, τ = 0.07·ps, over the clear sky and, by the adding method, over the cloud tops | `rayleighReflect`, `temperature.js` |
| Air's absorption of sunlight | + 0.024 · ln ps (ExoPlaSim's 0.265 and 0.282 at 4 and 10 bar, from its albedo and surface sunlight) | `airAbsorbExtra`, `temperature.js` |
| Sea evaporation | × (0.5 + 0.5 · the surface's sunlight against 1 bar's): half energy-limited, fitted to ExoPlaSim's rain | `seaEvaporationScale`, `rain.js`, `rain/locked` |
| Surface wind speed | ∝ ps^−0.13 | `windScale`, `circulation.js` |
| Wind stress on the ocean | air density ∝ ps | `ocean.js` |
| Psychrometric constant (evaporative share Δ/(Δ+γ)) | ∝ ps | `rain.js`, `temperature.js`, `diurnal.js` |
| Mean sea-level pressure | 1011 hPa · ps | `circulation.js` |

## Reference

Worldbuilding Pasta 2025, "Climate Explorations: Pressure" (ExoPlaSim, Earth's terrain, N₂ varied). At that article's 15 °C-holding starlight the `surface pressure (bar), ExoPlaSim's sunlight` rows of `src/test/earth/climatev2-orbit-sweep.diagnostic.smoke.test.ts` give:

| bar | Global T (°C), ours / ExoPlaSim | Precipitation vs 1 bar, ours / ExoPlaSim | Bond albedo, ours / ExoPlaSim | Surface sunlight vs 1 bar (per unit starlight), ours / ExoPlaSim |
| --- | --- | --- | --- | --- |
| 0.1 | 15.1 / 15.9 | 206 % / 200 % | 0.31 / – | 1.15 / – |
| 0.25 | 15.6 / 14.1 | 158 % / 145 % | 0.30 / – | 1.10 / 1.11 |
| 0.5 | 13.7 / 14.1 | 115 % / 117 % | 0.30 / – | 1.05 / 1.08 |
| 2 | 15.4 / 15.3 | 77 % / 81 % | 0.31 / – | 0.93 / – |
| 4 | 15.6 / 14.5 | 61 % / 61 % | 0.34 / 0.39 | 0.82 / 0.73 |
| 10 | 14.4 / 15.6 | 42 % / 42 % | 0.42 / 0.47 | 0.61 / 0.53 |

ExoPlaSim's thick air reflects more (0.30 → 0.39 → 0.47) and absorbs more of the sunlight before the surface, and its rain falls with the surface's sunlight. Here Rayleigh scattering over the cloud tops brings the albedo most of the way (it was 0.33 and 0.38 over the clear sky alone), the air's absorption grows with the pressure, and half of the sea's evaporation follows the surface's sunlight: thick-air rain now falls as ExoPlaSim's for the same reason rather than through a weaker greenhouse. The albedo stays ≈ 0.05 short at 4 and 10 bar.

Thick air damps the seasons and the day's range (40–70°N land seasonal range 29 °C at 1 bar, 9.7 °C at 10 bar) and evens the equator-to-pole contrast (45 °C → 18 °C). Thin air sharpens both and grows larger ice caps, as in ExoPlaSim. Known departures: below 0.25 bar the contrast keeps widening (82–90 °C at 0.1 bar), where ExoPlaSim's flattens; boiling at low pressure (≈ 45 °C at 0.1 bar) is not modelled; and the ITCZ's seasonal swing grows with the pressure (≈ 5° at 0.1 bar, 14° at 1 bar, 22° at 10 bar) where ExoPlaSim's shrinks in thick air ("little global shift" at 10 bar) and "swings far" at 0.1 bar. Above 1 bar the ITCZ is taken from the moist static energy profile's peak toward the centre of its warm half (ln ps / ln 10 of the way: `rising`, `circulation.js`), which stopped thick air's flat profile flipping the ITCZ between hemispheres (21° in a month at 10 bar; its swing was 34°); what remains is that the belts follow the profile's shape, not the seasonal energy imbalance that a thick atmosphere's heat capacity absorbs. Weighting land more in thin air (its heat capacity falls with the pressure) did not move the 0.1 bar ITCZ, held near the equator by the sea's warm band. Run the sweep with `SWEEP_KNOBS="surface pressure"`.

## Tidally locked planets

`src/test/earth/climatev2-locked-budget.diagnostic.smoke.test.ts` sweeps a locked Earth (365-day orbit, no tilt) over the same pressures and reports the global, dayside and nightside means, the day–night contrast, sea ice, the albedo by part and the global energy balance. `LOCKED_PRESSURES` picks the pressures; `LOCKED_EXOPLASIM_SUN=1` runs each at ExoPlaSim's 15 °C-holding starlight (the locked planet's monthly flux table scaled with `sunScale`).

The locked solve is deflated (`HelmholtzSolver.solve`'s `deflate`): its day–night transport is many times the radiative damping, and plain V-cycles barely moved the planet's mean, so the cloud pass stopped with the budget 24–36 W/m² out of balance and up to 18 °C too warm (the old 32–33 °C plateau above 2 bar). Each V-cycle now sets the mean exactly; the budget closes to within 1.4 W/m².

Weak-gradient transport keeps the air column nearly even across the planet; each surface beneath it is set by its own balance (`lockedSurface`, `temperature.js`), solved as σT_s⁴ − σT_a⁴ + k·(T_s − T_a) = rhs (`groundBalance`):

- Sunlit ground and the open sea, by day and by night (stirred from below), convect: rhs is the sunlight the surface takes beyond the planet's mean, and k the surface layer's heat ρ·c_p·C_H·U plus, where wet, evaporation ρ·L·C_H·U·dq_s/dT (independent of the pressure). C_H = 1.5 × 10⁻³ (Garratt 1992), U = 22 km/h × `windScale` (ExoPlaSim's Earth mean), land half as wet as the sea.
- Dark land and sea ice lie under a stable layer (`darkGround`): rhs = −(1 − ε)·σT_a⁴, with ε Earth's back radiation (333 / 396 W/m², Trenberth et al. 2009) scaled by the greenhouse's share of the surface's emission (1 − OLR/σT⁴), and k = ρ·c_p·C_H·`TEMP_INVERSION_WIND`. It replaces the snow inversion on locked worlds.

Snow and sea ice follow the surface's temperature, and the surface's departure from the air reaches space through the window, (1 − ε)·σ·((T_a + δ)⁴ − T_a⁴), in the energy balance, so the budget stays closed. The offsets are relaxed by half each round; 12 rounds (10 warm-started) close every pressure to within 0.9 W/m² (≈ 16 s per locked world on the Earth fixture, rain, winds and ocean included).

Current results with every piece below in place are under [Calibration and results](#calibration-and-results).

### Rain

The locked rain stage (`src/model/climatev2/rain/locked`) runs after the cloud pass, on the climate grid; cells take it through the same sampler as the temperature (rain by height and texture included), and `post-elevation` uses it for every locked world. The sea evaporates by the rotating stage's bulk formula (`RAIN_EVAP_COEFF`, `RAIN_SURFACE_RH`) at the planet's mean surface wind (`surfaceWind`, `pressure.js`), none under sea ice; land at the Priestley–Taylor rate of its surface's net radiation, limited by the rain that reaches it (Turc–Pike). Under the even air the column rises where the surface heats it more than the planet's mean (the sunlight the surface takes beyond its mean, as in `lockedSurface`), and all the planet's evaporation rains out there in proportion; the subsiding nightside stays dry.

The trend with pressure follows ExoPlaSim's rotating one in direction below 1 bar (more rain in thin air at its 15 °C-holding starlight), steeper below 0.5 bar, where the substellar sea runs past its boiling point (≈ 46 °C at 0.1 bar), which is not modelled.

Some of the water crosses the terminator and falls as snow on the permanently dark cells, evenly: the nightside's mean rate in the climate models of Earth-like locked planets by rotation period (Menou 2013, Table 1: 0.29 mm/day at 120 h, 0.12 at 240 h, 0.009 at 480 h; interpolated log–log and held beyond), taken out of the planet's evaporation so the rain still balances it. A slowly turning planet carries little past the terminator (Merlis & Schneider 2010): the year-long locked Earth gets ≈ 3 mm/yr on its nightside, a 5-day lock ≈ 100 mm/yr. The locked diagnostic's `LOCKED_PERIOD_HOURS` sets the period (rain there is per planet year; `nightRainMmDay` is per day).

### Winds and ocean

Locked winds and currents are derived from the finished climate (`CLIMATE_V2.computeLocked`) and do not feed back into it: the day–night transport is the energy balance's own.

- Winds (`src/model/climatev2/circulation/locked`): the surface air flows in to the ascent, u = ∇φ with ∇²φ = −(S − S̄) (the rain stage's driver), scaled so its mean speed is the planet's mean surface wind (`surfaceWind`). Sea-level pressure is the thermal low: 1013.25 hPa × ps less half the surface's warming over the planet's mean, as a share of its kelvin temperature.
- Currents (`src/model/climatev2/ocean/locked`): with almost no Coriolis force the surface drifts downwind toward the substellar point at 3 % of the wind (Wu 1983).
- Ocean heat: in the surface balance (`lockedSurface`), the sea's departure from the sea's mean sunlight is reduced by 0.35, Earth's ocean share of the poleward heat transport at 20° (Trenberth & Caron 2001), and that heat is given to the seas the sun heats least, so it sums to zero over the sea. It moves 30–45 W/m² from the dayside's seas to the nightside's (measured before the deck calibration, 1 bar: substellar 23.3 → 19.4 °C, antistellar 2.5 → 3.6 °C; 0.5 bar at ExoPlaSim's starlight: sea ice 12 % → 1.5 %). The share is an analogue, not a locked-ocean result: dynamic-ocean studies of locked planets (Hu & Yang 2014) find the ocean opens much of the nightside's sea, more than this does at Earth's starlight (0.5 bar: 49 % sea ice).

The rotating ocean stage (`windDrivenOcean`) is not used: its gyres and Ekman transport are set by the Coriolis force, which a locked planet's year-long day all but removes.

### Range and potential evaporation

A locked planet has no day cycle, so its within-month temperature range (`temperature_monthly_range`, and the daily minimum and maximum built from it) is only the libration's drift through the month: half the change in each cell's temperature from the month before to the month after (`CLIMATE_V2.computeLocked`). It is near zero for a circular, untilted orbit and grows with eccentricity and obliquity (before the deck calibration, test world with the default tilt, dayside land: 3.7 °C at eccentricity 0 and 7.1 °C at 0.2; nightside 0.5 and 1.4 °C).

Potential evaporation (`pet_monthly`) is Priestley–Taylor on the land surface's net radiation from the locked surface balance, at the surface's temperature (`CLIMATEV2_LOCKED_RAIN.potentialEvaporation`, the rain stage's own land evaporation), instead of Hargreaves on the top-of-air sunlight and the range: test world ≈ 1840 mm/yr on dayside land, ≈ 8 on the nightside.

### Calibration and results

The substellar cloud deck (`src/model/climatev2/clouds/locked`) is set against Yang, Cowan & Abbot 2013 (CAM3, 1:1 locked, an M-star, an ocean without currents; their Table 1): a locked planet's planetary albedo 0.45–0.47 at 1200–1400 W/m², higher for a hotter star, and its clouds' greenhouse 20–30 W/m² in the global mean. `DECK_ALBEDO` 0.3 gives 0.47 on the locked Earth at 1 bar; `DECK_LONGWAVE_SHARE` 0.32 gives 25 W/m² (0.5 gave 39 W/m² and a planet ≈ 8 °C warmer). Their locked planets are cold, 238 K at 1400 W/m², as the deck makes ours.

The ocean share (0.35) remains an analogue. The coupled studies constrain it only in kind: a continent-free ocean carries enough heat to the nightside to halve the albedo (Yang et al. 2013: 0.48 → 0.26, 247 → 296 K at 1600 W/m², mostly by thinning the substellar clouds, which this deck does not do), while continents block it — two meridional ridges leave the albedo as without currents (Yang et al. 2013), and a substellar continent past ≈ 20 % of the surface leaves the climate as without ocean transport (Salazar et al. 2020).

| bar | Earth's starlight: global / substellar / antistellar / day land / night land (°C), sea ice, rain, albedo | ExoPlaSim's starlight: the same |
| --- | --- | --- |
| 0.1 | −31.2 / 30.1 / −78.8 / 12.9 / −68.0, 60 %, 344 mm/yr, 0.48 | 2.9 / 64.3 / −49.0 / 40.5 / −30.1, 54 %, 1563 mm/yr, 0.49 |
| 0.25 | −20.2 / 17.7 / −44.2 / 6.7 / −39.7, 84 %, 175 mm/yr, 0.47 | −3.4 / 29.8 / −27.2 / 19.5 / −21.2, 57 %, 434 mm/yr, 0.49 |
| 0.5 | −8.5 / 15.1 / −21.8 / 7.6 / −19.3, 80 %, 160 mm/yr, 0.46 | −3.7 / 19.0 / −16.8 / 11.6 / −14.2, 58 %, 223 mm/yr, 0.48 |
| 1 | 0.7 / 13.6 / −5.9 / 8.9 / −5.6, 39 %, 232 mm/yr, 0.47 | 0.7 / 13.6 / −5.9 / 8.9 / −5.6, 39 %, 232 mm/yr, 0.47 |
| 2 | 5.3 / 13.0 / 2.3 / 10.1 / 3.2, 0 %, 322 mm/yr, 0.50 | 3.6 / 10.9 / 0.4 / 8.8 / 1.4, 0 %, 295 mm/yr, 0.47 |
| 4 | 8.1 / 12.3 / 6.5 / 10.9 / 7.8, 0 %, 315 mm/yr, 0.54 | 6.0 / 9.9 / 4.3 / 9.2 / 5.7, 0 %, 287 mm/yr, 0.48 |
| 10 | 8.8 / 10.3 / 8.2 / 10.1 / 8.7, 0 %, 229 mm/yr, 0.59 | 7.6 / 8.9 / 7.0 / 9.0 / 7.6, 0 %, 218 mm/yr, 0.54 |

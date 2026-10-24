# Climate v2 cloud cover

V2 diagnoses monthly cloud fractions on its climate grid. The same fractions supply the daily solar attenuation, regional radiation corrections, generated cloud map and hover values. Imported Earth observations remain available separately for comparison.

## Cloud estimate

`src/model/climatev2/clouds/index.ts` owns `CLIMATEV2_CLOUDS`. It reuses the rain stage's column relative humidity and transported stability, and the circulation stage's low-level convergence. Column humidity is not surface humidity; stability is the model's regional surface-temperature and pressure proxy, not a measured vertical inversion.

The low-cloud estimate is:

```text
moisture = clamp01((columnRH - 0.2) / 0.6)
stable = clamp01(stabilityK / 5)
ascent = clamp01(convergencePerSecond * 86400 / 0.5)
low = moisture * (0.3 + 0.6 * stable + 0.1 * ascent)
```

The 0.2–0.8 column-moisture range gives a gradual transition rather than treating column humidity as local saturation. A 5 K stability scale spans half the rain stage's existing 10 K stability cap. The convergence scale of 0.5/day corresponds to a two-day convergence timescale. The low-cloud fractions assign 0.3 to moist mixed conditions, another 0.6 to stable conditions, and at most 0.1 to resolved ascent. These are heuristic values for this reduced model, not coefficients taken from a published cloud scheme.

Rain-bearing cloud retains the existing condensation proxy `high = 1 - exp(-rainMmPerEarthMonth / 100)`. The 100 mm/month scale is inherited from v2's temperature and daily-range models: it yields approximately 63% cover at that rain rate. The name `high` denotes a rain-bearing/deep-cloud proxy; the model does not resolve cloud altitude. The two components combine by random overlap, `cover = 1 - (1 - low) * (1 - high)`.

Moisture and stability are established cloud-parameterization inputs, but this implementation lacks the vertical profiles and cloud condensate of a full scheme. See [NASA GISS cloud processes](https://simplex.giss.nasa.gov/gcm/doc/ModelDescription/Cloud_processes.html). The approximation should be evaluated on other climates before extrapolating beyond Earth.

## Radiation and coupling

`src/model/climatev2/clouds/radiation/index.ts` owns `CLIMATEV2_CLOUD_RADIATION`. Rain-bearing cloud keeps v2's existing 0.262 shortwave land albedo contrast. The full shortwave correction now affects surface sunlight and reflected solar energy. Infrared trapping is a separate heating term in W/m²; it does not restore sunlight to the ground.

Exposed low cloud, `low * (1 - high)`, adds a regional albedo contrast of 0.04. Its land correction is centred on the area-weighted land mean; its ocean correction is centred on the ocean mean of each latitude row. This avoids adding a second mean cloud forcing on top of the fitted background reflectance. Snow and sea ice mask the respective regional corrections. The 0.04 value is a conservative residual contrast around that background: 0.1 was also evaluated on Earth and worsened monthly temperature error and Köppen exact match. It is not an independently measured optical property.

The daily cycle uses total cover in the existing `1 - 0.75 * cover^3.4` sunlight multiplier. Rainfall still controls surface wetness separately. No extra empirical cloud-temperature modifier is applied after v2.

### Thermal cloud contrast

The radiation separation was informed by the WebGCM implementation in `.claude/worktrees/webgcm-geodesic/vendor/webgcm/js/physics/radiation.module.js`, inspected at upstream commit `fb9fff5e927159ee64511303a46568687c473bb1`. Its useful structural ideas are separate shortwave and longwave fluxes and colder cloud emission. This reduced implementation uses the standard Stefan–Boltzmann equation directly; it has no runtime dependency on that worktree.

Each diagnosed component carries a thermal contrast `sigma * (T_surface^4 - T_cloud^4)`. Here `sigma = 5.670374419e-8 W/m²/K⁴`; the cloud temperature is approximated as 10 K colder for low cloud and 50 K colder for the rain-bearing/deep-cloud component, with a 180 K floor. At a 6.5 K/km environmental lapse rate, those drops correspond to about 1.5 km and 7.7 km above the surface. They are representative reduced-model heights, not diagnosed cloud-top heights or a vertical temperature profile. The floor keeps the proxy within a cold upper-atmosphere range and its thermal contrast nonnegative, including very cold surface inputs.

The deep-cloud heating uses positive cloud anomalies above the existing land background, multiplied by the convective-belt weight, the inherited 0.8 deep-cloud share and an effective escaping-flux fraction of 0.4. The low-cloud heating uses its exposed regional anomaly and an escaping fraction of `0.4 * 0.04 / 0.262`, retaining the conservative residual weight used by its shortwave correction. The escaping fraction represents the part of the clear atmosphere's outgoing radiation that the added clouds intercept; it is not a resolved spectral atmospheric window. Values 0.25, 0.5 and 0.7 were also evaluated; 0.4 retained the useful rain response with a small classification tradeoff. This is Earth calibration of a simplified gray treatment.

Longwave heating enters the energy balance independently of incoming sunlight and is not masked by surface snow or ice. `budget.cloud` records the solar-weighted shortwave albedo correction; `budget.cloudLongwaveWm2` records the separate area-mean infrared heating. The Earth benchmark now saves this budget under `radiation`.

### Pass order

The pass order is temperature/wind/ocean coupling → rain and moisture → diagnosed clouds → temperature and daily cycle → one rain correction. The rain correction consumes cloud-shaded surface sunlight and the updated temperature. It improves rainfall errors with the separated radiation treatment, whereas it did not improve the earlier net-albedo treatment enough to retain. An additional cloud/temperature pass after corrected rain was also tested and rejected because it worsened Köppen accuracy and temperature error.

The diagnosed fields describe the moisture state that supplied the radiation pass. The returned rain has one further update; there is no claim of a converged cloud–rain feedback loop. The wind and ocean remain from the earlier coupled stages. This is still a seasonal reduced model rather than a vertical, time-stepping GCM.

## Earth evaluation

Use the same imported Earth terrain, seed 14963991, 204000 points, 23.5° obliquity, eccentricity 0.0167 and observational masks for each comparison:

```sh
pnpm exec vitest run --project smoke src/test/earth/earth-climatev2-compare.diagnostic.smoke.test.ts
pnpm exec vitest run --project smoke src/test/earth/climatev2-humidity-cloud-compare.diagnostic.smoke.test.ts
pnpm exec vitest run --project smoke src/test/earth/climatev2-clouds.smoke.test.ts
pnpm lint
pnpm typecheck
```

Run comparisons sequentially. `CLIMATE_BENCH_TITLE` labels climate benchmark output under `stats/climate/`; reports stay local. The diagnostic records the actual v2 cloud output rather than reconstructing cloud cover from rainfall. Its cloud reference is ERA5 total cloud cover, 1991–2020. The climate benchmark reports land monthly/annual temperature MAE, rainfall MAE and bias, and exact/major Köppen match, including regional breakdowns. Cloud diagnostics use area weights; the primary climate metrics retain their existing cell-based weighting.

The first cloud calibration preserved Köppen exact match at 46.9% and changed monthly temperature MAE from 3.636°C to 3.633°C, with unchanged rainfall MAE. Cloud-cover monthly MAE improved from 26.4 to 17.6 percentage points, but remained worse than the separate empirical display proxy's approximately 13 points. These comparisons use the calibration Earth fixture and do not establish accuracy on other planets.

The final detailed climate comparison is saved locally at `stats/climate/2026-10-24T16-27-47-165Z-cloud-moisture-final/`, including `results.json`, `comparison.json` and `comparison.md`. Its fresh baseline is `stats/climate/2026-10-24T16-14-21-872Z-cloud-moisture-baseline/results.json`. Cloud references are `stats/climate/2026-10-24T15-21-47-908Z-humidity-cloud/results.json` and `stats/climate/2026-10-24T16-27-17-522Z-humidity-cloud/results.json`.

The daily-range diagnostic shows a small land MAE regression, from 2.82°C to 2.87°C; sea MAE remains 1.17°C. This is an observed cost of using the larger diagnosed cover in the existing daily-cycle attenuation formula. The final daily-range report is `stats/climate/2026-10-24T16-28-14-998Z-diurnal-compare/results.json`, compared with `stats/climate/2026-10-24T15-35-46-553Z-diurnal-compare/results.json`. The cloud-enabled temperature pass took 2.214 seconds versus 1.785 seconds in the baseline; these are single-run execution measurements, not a stable latency estimate.

Fixed-input checks cover dry/moist stability response, cyclic interpolation, year-length normalization, layer overlap, bounded fractions, uniform-field radiation and ocean-row radiation centring. They do not use sampled distributions.

The subsequent GCM-inspired radiation experiment uses the first cloud version as its baseline. The retained 0.4 thermal escaping fraction with one rain correction changes monthly rain MAE from 46.0 to 45.5 mm/month and annual rain MAE from 419.8 to 413.5 mm/year. Monthly temperature MAE is essentially unchanged, 3.633°C to 3.636°C. Köppen exact match decreases slightly, 46.9% to 46.7%. These results support a modest rainfall improvement, not an across-the-board climate accuracy gain. Fixed-input checks additionally verify that changing infrared trapping leaves shortwave reflection unchanged and that colder cloud emission produces a greater thermal contrast.

The follow-up report and comparison are in `stats/climate/2026-10-24T16-55-59-258Z-gcm-cloud-final/`. Cloud cover remains at 17.6 percentage points MAE in `stats/climate/2026-10-24T16-55-26-923Z-humidity-cloud/results.json`. Daily-range MAE is unchanged at 2.87°C on land and slightly lower at 1.16°C at sea in `stats/climate/2026-10-24T16-56-30-053Z-diurnal-compare/results.json`. The added rain pass took 0.891 seconds in this run; recorded v2 stage times summed to 8.338 seconds versus 7.397 seconds in the first cloud version's baseline. These are single-run timings under different machine load. The final global budget records 1.34 W/m² of additional longwave cloud heating, separately from its shortwave cloud albedo correction.

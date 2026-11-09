# Climate v2 accuracy investigations

A log of what has been measured, tried and ruled out while trying to raise Climate v2's PASTA and Köppen match on the imported Earth (2026-11-08 to 2026-11-09). Read it before starting a new investigation: most plausible single-mechanism fixes for rain have already been tested.

All numbers are on the imported Earth (`CLIMATE_EARTH.importWorld()`, seed 14963991, 204k points), land cells with observed climate. Run reports land in `stats/climate/<timestamp>-<title>/results.json`, which is gitignored and stays local.

## Where the PASTA points go

PASTA exact match is 43.98%. Swapping one model input at a time into the observed classifier path (`climatev2-pasta-misses` diagnostic) shows what each input's errors cost on their own:

| Model input used (rest observed) | PASTA exact | Points lost |
|---|---|---|
| Rain only | 61.3% | 38.7 |
| Mean temperature only | 76.3% | 23.7 |
| Day–night range (DTR) only | 89.5% | 10.5 (12.4 before the DTR tune) |
| All model inputs | 44.0% | |

The classifier path itself costs nothing: the model through the observed path scores the same 43.98%.

Rain's loss by latitude band (share of all scored land):

| Band | Rain-alone loss |
|---|---|
| 0–10° | 8.5 |
| 10–25° | 12.6 |
| 25–35° | 8.3 |
| 35–45° | 5.6 |
| 45–60° | 3.4 |
| 60–90° | 0.2 |

About 30 of rain's 39 points are lost at 0–35°. Polar rain errors barely matter for PASTA, because polar classes are set by temperature.

At 10–25° the misses are spread across every region (0.3–1.9 points each), in both directions: the same tropical classes (forest, moist and dry savanna, semidesert) are missed too wet in some places and too dry in others. The clearest single structural error is over Africa and Arabia in July–September: the Sahel wet season gets 27% of observed rain while Arabia gets 6.7×. Dry seasons across Africa and Arabia are 2.5–3.7× too wet.

## Seasonal pattern of land rain

Model ÷ observed land rain (`climatev2-rain-residuals` diagnostic), after the storm-lift change:

| Band | Winter | Summer | Annual |
|---|---|---|---|
| 0–10° | 1.06 | 0.93 | 0.90 |
| 10–25° | 1.84 | 0.91 | 1.07 |
| 25–35° | 0.83 | 1.39 | 1.19 |
| 35–45° | 0.77 | 1.47 | 1.12 |
| 45–60° | 1.12 | 1.27 | 1.31 |
| 60–90° | 1.09 | 1.92 | 1.66 |

Mid-latitude seasons are inverted: winter too dry, summer too wet, with annual totals close. Before storm lift, 25–45° winter was 0.65.

## Changes kept

| Change | Effect | Where |
|---|---|---|
| Storms lift the stability penalty: `RAIN_STORM_LIFT` = 1 | 25–45° winter rain 0.65 → 0.80 of observed; rain error 411.6 → 409.1 mm; Köppen 47.2 → 47.7% | `rain.js`, `config.js` |
| DTR tune: `CLEAR_SKY` 0.693, `ALBEDO_LAND` 0.213, `EXCHANGE` 0.005, `WEATHER_LAND_C` 6.5 | DTR-swap PASTA 87.6 → 89.5%; land DTR error 2.64 → 2.26 °C | `diurnal.js` |
| Priors for `TEMP_LOW_CLOUD_ALBEDO`, `TEMP_CLOUD_LONGWAVE_WINDOW`, and `DIURNAL_PRIORS` | lets the tuner move them | `config.js`, `diurnal.js` |

The DTR tune gained 1.9 points against a 2-point bar; it was kept by decision.

## Tried and reverted

| Idea | Result | Verdict |
|---|---|---|
| SE-coast dryness from the stability terms (local temperature reference, high-pressure stability, front fade) | Stability fully off: SE US winter 63 → 120 mm (observed 335); front fade: no effect | Not the SE-coast cause |
| `CIRC_OCEAN_HIGH_HPA` 2 → 8 (its literature value) | Fixes SE-coast winter winds (SE US, E Australia); annual SE-coast rain +30–40%; Köppen exact −0.9, temperature error +0.13 °C | Not applied: a global trade |
| Storm strength from the local temperature gradient, applied to the storms' humidity spread | SE US winter 63 → 78 mm; global scores flat | Reverted: too small |
| Per-cell eddy mixing (multigrid solver change) | Under 2 mm change; coastal and offshore columns hold the same water | Reverted: no moisture to mix |
| Tuner on combined PASTA exact (10 keys, 75 evaluations) | 43.91 → 44.17%; best trial 44.31% | Not applied: PASTA flat in these parameters |
| Tuner on the rain-swap score (8 rain keys, 58 evaluations) | 61.34 → 61.61%; best trial 61.66% (bar 63.3%) | Not applied: rain parameters can't fix rain |
| Storm-front baseline scaled by seasonal storm strength | Summer 35–45° 1.47 → 1.39, 45–60° 1.27 → 1.22 (bar −0.1); PASTA flat | Reverted |
| Storm mixing length `RAIN_EDDY_LENGTH_KM` 900 → 600 | PASTA +0.5, desert rain 232 → 201 mm, but Köppen −3.3 and 25–45° winter 0.82 → 0.61 | Refused by the guards |

## Hypotheses tested without a model change

| Hypothesis | Test | Verdict |
|---|---|---|
| Winter rain is frontal, driven by local temperature contrast | Observed ÷ model winter rain at 25–45°, binned by column humidity and smoothed temperature gradient | Half right: the model under-rains 1.5–2.5× at humidity 0.40–0.55, but not as a function of the gradient (correlation 0.09) |
| The minimum eddy mixing leaks moisture into deserts | Desert moisture budget; `RAIN_EDDY_DIFF` 0 and ¼ | Wrong term: mixing imports 78% of desert rain, but most of it is the storm part; rain-swap PASTA unchanged |
| Land recycling is too strong | Passive tracer of land evaporation through the converged rain operator (self-check exact) | Ruled out: 34.7% of land rain recycled vs ≈ 40% observed (van der Ent et al. 2010); deserts 35% |
| Moist convergence depth sets the summer excess | `RAIN_WIND_DIV_MOIST` 0.6 → 0.4 | Inert: identical results |
| Sea evaporation sets the summer excess | `RAIN_EVAP_COEFF` 1.3e-3 → 1.0e-3 | Not seasonal: every band scales down 15–20% |
| Afternoon land convection sets the summer excess | `RAIN_LAND_CONVECTION` 0 | Partial: 25–45° summer about 1.4 → 1.3 |
| The 10–25° dry season costs its PASTA points | Storm mixing, tropical disturbances, land convection, storm lift and minimum mixing each switched off | Ruled out: 10–25° rain loss stays at 12.5–12.8 points in every case |

Other measured signals:

- Winter under-rain at 25–60° grows with the model's stability (correlation +0.18) and is worst where the rain-rate multiplier is smallest; removing the stability penalty entirely makes 10–25° winter 2.1× too wet, so it needs to depend on regime rather than just be weaker.
- Summer over-rain does not track stability or the rain-rate multiplier; it is worst at high column humidity.
- The 60–90° summer excess (1.9×) is untouched by every term tested, but costs only 0.2 PASTA points.

## Open leads

- **Tropical rain band and monsoon placement** (Sahel too dry, Arabia too wet, Mexico too dry, SE Asia too wet): about 3–4 points over Africa and Arabia. The circulation stage puts the tropical trough at each longitude's warmest latitude; check where the July–September peak rain sits per longitude against observed and against the trough before changing anything. This is a circulation-stage change and needs a plan.
- **The yardstick:** many PASTA misses are adjacent classes (tropical forest vs moist savanna). A near-match or graded score would show how much of the 56% miss is close.
- **Mean temperature** (24 points): mostly high-latitude winters too mild (continental temperate read as oceanic, boreal as temperate); not yet investigated.

## Tools

| Diagnostic (`src/test/earth/`) | What it measures | Run time |
|---|---|---|
| `climatev2-pasta-misses.diagnostic.smoke.test.ts` | PASTA swaps, points lost per band, 10–25° miss pairs and regions | ≈ 45 s |
| `climatev2-rain-residuals.diagnostic.smoke.test.ts` | Model ÷ observed land rain by season, band, coast exposure; winter error against rain-stage inputs | ≈ 40 s |
| `climatev2-rain-hypotheses.diagnostic.smoke.test.ts` | Winter rain by humidity × gradient, stability and rate; desert and 10–25° dry-season moisture budgets | ≈ 40 s |
| `climatev2-rain-recycling.diagnostic.smoke.test.ts` | Land-evaporation tracer: recycled share by band and season | ≈ 40 s |
| `climatev2-se-coast-rain.diagnostic.smoke.test.ts`, `climatev2-se-coast-winds.diagnostic.smoke.test.ts` | SE-coast rain and winter winds by pressure term | ≈ 1 min each |
| `climatev2-tune.diagnostic.smoke.test.ts` | Coordinate-descent tuner (after the vendor's `coupled-check.mjs --tune`) | ≈ 8–12 s per evaluation |

All take parameter overrides through `CLIMATE_PARAMS` (JSON), except the tuner, which uses `TUNE_OBJECTIVE` (`pasta`, `dtr`, `rain`), `TUNE_KEYS`, `TUNE_ROUNDS` and `TUNE_STEP`. The tuner guards PASTA, Köppen, rain and temperature error, the 25–45° winter rain ratio and a generated planet's aridity and rain, and pulls each key toward its literature prior. The whole-Earth scores come from `earth-climatev2-compare.diagnostic.smoke.test.ts` (≈ 40 s).

## Working rules that came out of this

- Measure before building: a model change needs a diagnostic showing the targeted error costs points.
- Set a pass bar before each attempt, and revert if it is missed.
- Score globally from the start; five-box regional checks repeatedly misled.
- Use the tuner, with a per-input swap objective, to answer whether existing parameters can fix an error before writing new physics.

# Earth temperature MAE experiments

This records the Earth-temperature calibration experiments exercised by `earth-real-temperature-compare.smoke.test.ts`. The fixture imports WorldClim land temperatures onto the generated Earth mesh.

Run the comparison with:

```sh
pnpm vitest run --project smoke src/test/earth/earth-real-temperature-compare.smoke.test.ts --reporter verbose
```

Verify the retained POISE reference solver against the pinned native VPLanet output with:

```sh
pnpm vitest run --project smoke src/test/earth/vplanet-ebm.smoke.test.ts --reporter verbose
```

`meanAbsErrorC` is the annual-mean land-cell MAE. `monthlyMeanAbsErrorC` is the MAE across every land-cell/month pair, and is the primary selection metric here.

## Current production configuration

Production climate generation uses the greenhouse EBM again. Its diffusion,
greenhouse strength, land-water coupling, and cloud adjustment retain the previous
settings. The elevation correction now varies by month: the lapse rate is
`9.8 - 4.8 * smoothstep(-20, 20, monthlyNoLapse)` C/km, retaining the existing
gravity scaling. `monthlyNoLapse` includes continentality but precedes elevation
and cloud adjustments. Cold columns receive stronger elevation cooling; warm
columns receive weaker cooling. Ocean cells receive no elevation correction.

| Configuration | Monthly MAE (C) |
| --- | ---: |
| Integrated POISE | 5.2942 |
| Previous greenhouse, fixed 6.5 C/km lapse | 3.9738 |
| Greenhouse, fixed 5.5 C/km lapse | 3.8696 |
| **Selected: greenhouse, seasonal lapse** | **3.6905** |

The selected change reduces monthly MAE by 0.2833 C (7.1%) relative to the older
greenhouse solver and by 1.6037 C (30.3%) relative to integrated POISE. Annual MAE
is approximately 3.00 C. The benchmark now requires monthly MAE below 3.75 C and
annual MAE below 3.1 C.

These are calibration results on the same Earth fixture, not independent
held-out validation or evidence of accuracy on other planets. Production uses
generated temperatures and terrain; it does not read observed temperature
rasters for the correction. The tidally locked temperature path is unchanged.

| Latitude band | Previous monthly MAE (C) | Selected monthly MAE (C) |
| --- | ---: | ---: |
| 90–60 S | 10.1587 | 7.5839 |
| 60–30 S | 2.0620 | 2.0246 |
| 30–0 S | 2.4170 | 2.5725 |
| 0–30 N | 2.6253 | 2.4506 |
| 30–60 N | 4.0043 | 3.5928 |
| 60–90 N | 5.7359 | 5.9992 |

Siberian January now averages -20.19 C against -24.85 C observed (previous
greenhouse: -18.81 C); July is 13.87 C against 16.15 C (previous: 13.25 C).
Regional errors remain, including regressions in the southern tropics and far
north despite the lower global monthly MAE.

Other full-pipeline trials were rejected: monthly instead of annual temperature
for cloud adjustment (4.0384 C); diffusion 0.4 (5.3493 C), 0.6 (4.3387 C), and
0.53 (3.9828 C). Removing the continentality polar taper was screened against
saved output and rejected without changing production.

## Rejected integrated POISE configuration

The rejected integration selected VPLanet POISE for worlds without explicit albedo, greenhouse, or seismology overrides. It uses 150 equal-area latitude cells, 60 seasonal samples, POISE's fixed linear outgoing-radiation law, separate land and water heat capacities, land-water coupling, seasonal zenith albedo, and seasonal ice mass balance. The world pipeline retains its softened ice feedback (`0.45` ice albedo and `3.5` ablation factor) plus the existing per-cell lapse, continentality, noise, and cloud adjustments.

| Result | Value |
| --- | ---: |
| Annual MAE | 4.40 C |
| Monthly MAE | 5.2942 C |
| Mean bias | +2.90 C |
| RMSE | 6.51 C |

This improves the untouched native VPLanet monthly baseline by `0.8555 C`, but regresses the previous greenhouse solver's `3.9738 C` result by `1.3204 C`.

## Previous greenhouse configuration

Before POISE was reintegrated, the selected configuration used the EBM's land-fraction-blended `temperature` output for every cell, rather than selecting the EBM's pure land or ocean output by cell type. It used:

| Setting | Value |
| --- | --- |
| Diffusion coefficient | `0.5` flat with latitude |
| Greenhouse factor | `0.596` |
| Land-water coupling | `0.8` |
| Continentality amplitude | `0.5 * polarTaper` |
| Low-cloud warming / high-cloud cooling | `4 C` / `2.5 C`, applied on land only |

| Result | Value |
| --- | ---: |
| Annual MAE | 3.30 C |
| Monthly MAE | 3.9738 C |
| Mean bias | +0.17 C |
| RMSE | 4.60 C |

## Results

Values below were measured with the smoke test. A dash means the monthly metric was not present when that early run was made.

| Experiment | Annual MAE (C) | Monthly MAE (C) | Outcome |
| --- | ---: | ---: | --- |
| Original: pure EBM land/ocean selected per cell, greenhouse `0.57` | 4.52 | — | Baseline |
| Blended EBM temperature, greenhouse `0.57` | 4.40 | — | Better annual fit |
| Old latitude-shaped diffuser with blended output | 4.85 | — | Rejected |
| Old latitude-shaped diffuser with separate output | 5.03 | — | Rejected |
| Blended output, greenhouse `0.597`, before cloud retune | 3.64 | 4.37 | Greenhouse removed most cold bias |
| Land-water coupling `0` | 3.62 | 4.46 | Rejected |
| Land-water coupling `1.6` | 3.72 | 4.59 | Rejected |
| Continentality amplitude `0.75` | — | 4.31 | Worse than `0.5` in that sweep |
| Continentality amplitude `0.25` | — | 4.31 | Worse than `0.5` in that sweep |
| No cloud temperature modifier | 3.59 | 4.21 | Better than the original cloud strengths, but not retained |
| Cloud strength `3 C` / `1.875 C` | 3.32 | 3.98 | Near-best |
| Cloud strength `4.5 C` / `2.8125 C` | 3.31 | 3.98 | Near-best |
| Retained cloud strength `4 C` / `2.5 C`, greenhouse `0.596` | 3.30 | 3.9738 | Best sampled monthly result |
| Reintegrated POISE production path | 4.40 | 5.2942 | Rejected; worse than previous greenhouse path |
| Native VPLanet POISE `EarthClimate` | 4.23 | 6.1497 | Raw external baseline; worse than the integrated pipeline |

The cloud rows compare changes to the cloud temperature modifier only; it remains land-only. They do not establish clouds as an explanation for any particular regional error.

## Native VPLanet baseline

The comparison test also loads a native VPLanet POISE `EarthClimate` run pinned to revision `dd55da7e1ff063f0ea7048f91c9d2d97d6ba9a5d`. It interpolates VPLanet's 150 equal-area latitude bands onto the same generated land cells used for the WorldClim comparison. Its 60 seasonal samples start at the northern winter solstice; the test linearly reconstructs the daily curve, aligns the solstice to December 21, and averages it into calendar months.

This produces `4.23 C` annual MAE and `6.1497 C` monthly MAE. The native output is a zonal, 34%-land surface-temperature blend, with no cell elevation or continentality correction, so this is an external EBM baseline rather than an equal-feature contest. The rejected POISE pipeline lowered that monthly error to `5.2942 C`; the previous greenhouse solver was lower still at `3.9738 C`.

## Siberia seasonal diagnostic

The smoke test also reports the 50–70 N, 60–140 E land-region diagnostic. With the rejected POISE integration its annual mean is warm: modeled `1.56 C` versus observed `-4.40 C` (bias `+5.96 C`). Its winter is much too warm:

| Month | Model (C) | Observed (C) | Bias (C) |
| --- | ---: | ---: | ---: |
| January | -8.31 | -24.85 | +16.54 |
| July | 13.12 | 16.15 | -3.02 |
| December | -5.17 | -22.00 | +16.83 |

The earlier greenhouse solver's `0.5` continentality setting produced much smaller winter biases. POISE's weaker zonal seasonal cycle dominated this diagnostic, despite retaining the same cell-level continentality adjustment.

## Removed ice-mass-balance trial

A temporary, mass-balance-only port of the historical POISE ice-sheet logic produced a snowball state in this EBM and measured 11.35 C annual MAE and 11.4823 C monthly MAE. It was removed. That result does not evaluate the full POISE climate model, whose ice scheme is coupled to additional assumptions not present here.

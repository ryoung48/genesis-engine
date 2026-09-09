# Earth temperature MAE experiments

This records the Earth-temperature calibration experiments exercised by `earth-real-temperature-compare.smoke.test.ts`. The fixture imports WorldClim land temperatures onto the generated Earth mesh.

Run the comparison with:

```sh
pnpm vitest run --project smoke src/test/earth/earth-real-temperature-compare.smoke.test.ts --reporter verbose
```

`meanAbsErrorC` is the annual-mean land-cell MAE. `monthlyMeanAbsErrorC` is the MAE across every land-cell/month pair, and is the primary selection metric here.

## Retained configuration

The selected configuration uses the EBM's land-fraction-blended `temperature` output for every cell, rather than selecting the EBM's pure land or ocean output by cell type. It retains:

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

The cloud rows compare changes to the cloud temperature modifier only; it remains land-only. They do not establish clouds as an explanation for any particular regional error.

## Siberia seasonal diagnostic

The smoke test also reports the 50–70 N, 60–140 E land-region diagnostic. In the retained configuration its annual mean is slightly warm, not cold: modeled `-3.94 C` versus observed `-4.40 C` (bias `+0.46 C`). Its seasonal cycle is too weak:

| Month | Model (C) | Observed (C) | Bias (C) |
| --- | ---: | ---: | ---: |
| January | -18.81 | -24.85 | +6.04 |
| July | 13.24 | 16.15 | -2.90 |
| December | -16.00 | -22.00 | +6.00 |

Increasing continentality amplitude from `0.5` to `1.0` improved the regional seasonal extremes (January bias `+4.10 C`, July bias `-0.77 C`), but raised global monthly MAE to `4.0565 C`. The retained `0.5` is therefore a global-MAE compromise, not a complete regional solution.

## Removed ice-mass-balance trial

A temporary, mass-balance-only port of the historical POISE ice-sheet logic produced a snowball state in this EBM and measured 11.35 C annual MAE and 11.4823 C monthly MAE. It was removed. That result does not evaluate the full POISE climate model, whose ice scheme is coupled to additional assumptions not present here.

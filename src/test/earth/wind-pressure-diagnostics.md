# Wind pressure and circulation diagnosis with observed Earth temperatures

2026-09-11. Diagnostic experiments, not a production change or an end-to-end climate validation.

## Main finding

The Earth comparison's seasonal clock is misaligned. The pressure diagnosis also identifies an overly strong prescribed tropical coastal-flow addition. With observed temperatures held fixed, supplying calendar-aligned Earth solar declination and reducing the western-boundary coefficient from 8 to 6 m/s lowers pooled ocean vector error from **3.258 to 3.127 m/s (4.0%)**, improves ocean direction cosine from **0.425 to 0.451**, and meets the existing speed checks. These are diagnostic substitutions, not production fixes.

The earlier sweeps below deliberately retain the original seasonal clock to isolate the effects of individual terms. Their results should be interpreted in that context. Full structured results are in [fixtures/wind-pressure-diagnostics.json.gz](fixtures/wind-pressure-diagnostics.json.gz).

## Setup

- Reused the Earth wind comparison's imported geography, seed 14963991, mesh, surface roughness, observation sampling, and scoring. No current-model substitutions or current scoring.
- Replaced monthly surface air temperatures and annual means with the local earth-real-temperature raster: WorldClim over land, NCEP where missing including oceans. All 2,448,012 region-month temperatures were finite.
- Sea-level temperature was observed surface temperature plus the existing modeled terrain-lapse correction. This preserves the baseline terrain treatment; it is not an independently observed sea-level temperature field.
- NCEP winds remained scoring targets, never wind-model inputs.
- The main baseline retains the wind model's extra ocean-temperature lag. A separate sensitivity removes it.
- Temporary instrumented copies reused the existing wind implementation and scorer; production files were not changed. The baseline reproduced the previous observed-temperature run exactly: ocean vector error 3.258, land 2.239 m/s.
- The initial ablations froze both Hadley pressure multipliers to the observed-temperature baseline's monthly values. This isolates each change from torque compensation. The no-torque case instead sets both multipliers to 1. The baseline still solves the multipliers normally.
- The follow-up restores the usual torque solve. Coastal additions occur after that solve, so reducing them does not alter its input or multipliers.
- Scores retain the existing per-region averaging and valid-observation filter. Atlantic tropical scores cover 30S–30N, 40W–10W; East Pacific tropical scores cover 30S–30N, 140W–90W.
- Empty latitude bins are NaN in the diagnostic trough detector, rather than zero. Stage traces retain all northward-to-southward zero crossings, actual teqByLon, and pressure-driven winds before/after the linear correction. A pressure minimum and a wind convergence crossing are different diagnostics.

## Initial ablations

| Experiment | Ocean vector error (m/s) | Land vector error (m/s) | Ocean direction cos | Atlantic tropical vector error (m/s) | N / S trade speed ratio | NH westerly speed ratio | Existing checks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| baseline | 3.258 | 2.239 | 0.425 | 3.706 | 0.80 / 0.92 | 0.94 | Pass |
| no-heat-fixed | 3.249 | 2.186 | 0.424 | 3.708 | 0.79 / 0.91 | 0.92 | Pass |
| no-thermal-fixed | 3.265 | 2.226 | 0.416 | 3.720 | 0.79 / 0.91 | 0.93 | Pass |
| no-dynamics-fixed | 3.366 | 2.370 | 0.427 | 3.617 | 0.86 / 1.01 | 0.98 | Fail |
| no-west | 3.043 | 2.193 | 0.450 | 3.495 | 0.68 / 0.80 | 0.84 | Fail |
| no-east | 3.262 | 2.242 | 0.424 | 3.758 | 0.80 / 0.91 | 0.93 | Pass |
| no-plateau-fixed | 3.249 | 2.205 | 0.422 | 3.668 | 0.80 / 0.91 | 0.93 | Pass |
| no-floor-fixed | 3.392 | 2.308 | 0.414 | 3.768 | 0.89 / 1.04 | 0.94 | Pass |
| no-torque | 3.197 | 2.047 | 0.416 | 4.167 | 0.60 / 0.56 | 0.88 | Fail |
| no-extra-lag-fixed | 3.234 | 2.226 | 0.432 | 3.752 | 0.80 / 0.91 | 0.92 | Pass |

heat = continental heat-low pressure term; thermal = sea-level temperature anomaly pressure term; dynamics = linear large-scale correction; west/east = prescribed coastal-flow additions; plateau = elevated warm-season heating used to locate the trough; floor = enhanced effective equatorial Coriolis magnitude.

The no-dynamics, no-west, and no-torque variants violate existing regression checks. The sweep completed all cases using soft assertions; its test process failed on those five individual assertions. This is diagnostic evidence, not a passing regression run.

## Follow-up: split the western-boundary addition

The western addition's spatial weight is min(1, tropical + subtropical). The tropical part is a Gaussian around the equator; the subtropical part is on the summer side near the Hadley width. Its north/south direction follows the sign of solar declination.

| Experiment | Ocean vector error (m/s) | Land vector error (m/s) | Ocean direction cos | Atlantic tropical vector error (m/s) | N / S trade speed ratio | NH westerly speed ratio | Existing checks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| baseline | 3.258 | 2.239 | 0.425 | 3.706 | 0.80 / 0.92 | 0.94 | Pass |
| no-west-tropical | 3.102 | 2.208 | 0.446 | 3.482 | 0.68 / 0.80 | 0.93 | Fail |
| no-west-subtropical | 3.187 | 2.222 | 0.432 | 3.700 | 0.79 / 0.91 | 0.84 | Fail |
| half-west-tropical | 3.153 | 2.218 | 0.435 | 3.523 | 0.73 / 0.85 | 0.93 | Fail |
| threequarter-west | 3.175 | 2.222 | 0.432 | 3.598 | 0.76 / 0.88 | 0.91 | Pass |
| no-heat-rebalanced | 3.245 | 2.186 | 0.425 | 3.700 | 0.79 / 0.91 | 0.92 | Pass |

no-west-tropical and no-west-subtropical remove only their respective contribution before the weight clamp. half-west-tropical halves the tropical contribution. threequarter-west scales the entire western addition from an 8 m/s coefficient to 6 m/s. None changes the eastern addition.

The tropical addition accounts for most of the Atlantic degradation: removing it improves Atlantic vector error from 3.706 to 3.482 m/s and ocean vector error from 3.258 to 3.102 m/s. But northern trade speed drops to 0.68 of observed. Halving it still fails the trade-speed floor (0.73). Removing only the subtropical part misses the NH westerly floor (0.84).

Reducing the entire western addition by 25% improves ocean vector error to 3.175 m/s (2.5%), land vector error to 2.222, and Atlantic vector error to 3.598. It passes the existing checks, narrowly on northern trade speed (0.76 against a strict >0.75 requirement). This is a candidate sensitivity result, not a validated replacement across other climates or monsoon regions.

Removing heat lows and recalculating torque improves land error to 2.186 but changes Atlantic error only from 3.706 to 3.700. Heat lows are not the main Atlantic cause in these experiments.

## What the Atlantic stage trace establishes

### September: an added crossing masquerades as a displaced trough

The actual trough input averages 10.86N over the Atlantic diagnostic longitudes. The pressure-driven meridional wind converges at 13.08N before the linear correction, then 13.52N afterward. Observed convergence is 12.22N.

After the coastal and terrain additions, the model has two convergent crossings: 6.44S and 13.52N. Their adjacent-bin meridional-wind drops are 1.466 and 1.302 m/s respectively. The existing strongest-crossing rule therefore reports the southern crossing. Removing the western addition leaves the northern crossing selected. Removing the tropical part isolates the responsible western contribution in the follow-up.

This is both a real spurious flow feature and a diagnostic ambiguity. It does not demonstrate that the entire pressure trough migrated south. Report all crossings, with their strengths and coverage, before describing a trough shift.

### Winter: an additional pressure-template/balance problem remains

In January the actual trough input averages 1.34N, yet pressure-driven winds already converge near 17.94S and 6.38S before the linear correction. The correction moves these only to 18.34S and 6.64S. Subsequent additions remove both crossings from the final basin profile. In February the pattern is similar. Removing the western term exposes a crossing near 6S, still far south of the observed approximately 7N.

The basin-mean pressure minimum moves from 7N to 13S under the January/February linear correction, but the meridional-wind crossings were already south beforehand. Thus a large shift in a basin-mean pressure minimum is not sufficient evidence that the correction caused the wind error.

December has a northern pressure-driven crossing near 5.13N before the correction; that crossing is absent afterward. The correction can worsen this local feature, even though removing it globally increases ocean vector error to 3.366 and land error to 2.370 m/s.

### Other hypotheses

- Removing the equatorial Coriolis floor worsens ocean vector error to 3.392. The mismatch with the linear solver's local Coriolis treatment remains worth understanding, but deleting the floor is not supported by this test.
- Disabling plateau heating barely changes pooled ocean error (3.249) and does not fix the winter Atlantic crossings.
- Removing torque scaling lowers pooled vector error partly by weakening winds. Northern/southern trades fall to 0.60/0.56, and Atlantic error worsens to 4.167. That is not a successful fix.
- January, February, and December baseline southern Hadley multipliers reach the 3x clamp. The solve is not guaranteed to achieve zero residual torque in those months.

## Winter gradient decomposition and longitude dependence

The January trough input is not a nearly horizontal line at its basin-average 1.34N: it runs from **8.62S at 37.5W to 7.48N at 10.5W**. February spans 9.22S to 8.74N. A single basin-average thermal equator conceals that geometry.

The January 5S ocean bin has a pre-correction meridional wind contribution of **-0.593 m/s** from the north–south pressure gradient and **+0.195 m/s** from Coriolis turning of the east–west gradient, totaling **-0.398 m/s**. Observed meridional wind there is **+1.577 m/s**. Near 1N, the pressure-gradient contributions are -2.554 and -0.313 m/s. The wrong near-equatorial flow therefore already involves the meridional pressure gradient, not just turning of zonal gradients by the correction. These are basin-bin averages; coast/coverage differences mean differentiating a basin-mean pressure profile is not equivalent to averaging the local pressure gradients.

### Ocean-only trough retest

The ocean-only variant masks land temperatures only for trough placement, retains the same longitude smoothing and existing lag, and leaves heat-low forcing intact. Both fixed and recomputed torque variants were tested.

| Experiment | Ocean vector error (m/s) | Land vector error (m/s) | Ocean direction cos | N / S trade speed ratio | NH westerly speed ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 3.258 | 2.239 | 0.425 | 0.80 / 0.92 | 0.94 |
| ocean-trough-fixed | 3.206 | 2.221 | 0.415 | 0.70 / 0.90 | 0.93 |
| ocean-trough-rebalanced | 3.203 | 2.225 | 0.413 | 0.70 / 0.84 | 0.94 |
| ocean-trough-threequarter-west | 3.131 | 2.210 | 0.419 | 0.66 / 0.81 | 0.91 |

Ocean-only placement does not solve the Atlantic error: it rises to 3.786 m/s with recomputed torque, versus 3.706 baseline, while northern trade speed drops to 0.70. All three ocean-only variants fail the northern trade floor. Lower pooled vector error is insufficient grounds to accept them.

### Extra-lag sensitivity

Reducing the western addition to 6 m/s while also removing extra ocean-temperature lag gives ocean vector error 3.155, land 2.212 m/s, direction cosine 0.438, trade ratios 0.77/0.88, and NH westerly ratio 0.89. This pair of variants passed the regression checks. The earlier no-extra-lag control with ordinary torque scaling was 3.238 m/s. Lag removal is not uniformly better: Atlantic tropical error in this combined case is 3.659 versus 3.598 with the lag retained.

## Calendar alignment: a distinct, testable input error

[INSOLATION.compute](../../model/climate/temperature/ebm/insolation/index.ts) defaults the starting solar longitude to -(40 * 2 * pi / 365), putting the spring equinox roughly 40 days after year start. [The climate monthly aggregation](../../model/climate/classification/climate/index.ts) then bins those days using January–December day counts. The wind model uses the resulting declination sign and magnitude to drive both seasonal coastal additions. That clock is about six weeks ahead of the observed-temperature and observed-wind calendar.

A separate wind-input diagnostic calculated daily Earth declination with the [NOAA solar-position equations](https://www.gml.noaa.gov/grad/solcalc/solareqns.PDF) and averaged it into the same non-leap-year months. Only declination_monthly changed; the EBM, pressure inputs, temperatures, torque solve and observation targets did not.

| Month | Existing declination | Earth calendar declination |
| --- | ---: | ---: |
| January | -9.35 deg | -20.82 deg |
| February | +2.03 deg | -13.01 deg |
| May | +23.20 deg | +18.70 deg |
| June | +19.57 deg | +23.05 deg |
| August | -0.55 deg | +13.84 deg |
| September | -11.93 deg | +3.11 deg |

| Experiment | Ocean vector error (m/s) | Land vector error (m/s) | Ocean direction cos | N / S trade speed ratio | NH westerly speed ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 3.258 | 2.239 | 0.425 | 0.80 / 0.92 | 0.94 |
| earth-calendar | 3.200 | 2.232 | 0.448 | 0.84 / 0.93 | 0.92 |
| earth-calendar-threequarter-west | 3.127 | 2.216 | 0.451 | 0.79 / 0.89 | 0.89 |
| earth-calendar-no-west-tropical | 3.087 | 2.205 | 0.449 | 0.69 / 0.80 | 0.92 |

Calendar alignment alone meets the checks and lowers ocean vector error by 1.8%, while improving direction cosine substantially. It does not fix Atlantic tropical error by itself (3.715 versus 3.706). Calendar alignment plus the 6 m/s western coefficient meets all existing checks: northern trades 0.79, southern trades 0.89, NH westerlies 0.89, land speed MAE 1.33 m/s. Completely removing the tropical addition still fails the northern trade floor (0.69). The calendar sweep's one failing assertion belongs to that removal variant, not to calendar alignment or the 6 m/s candidate.

The calendar diagnostic shows a reproducible Earth-comparison mismatch, but does not by itself establish how the synthetic-world year should be anchored. Fix the shared calendar convention deliberately; do not quietly retime all EBM temperatures while addressing wind, because that would also change existing temperature calibration.

## Next implementation experiments

1. Establish an explicit Earth-calendar phase for solar declination at the wind input boundary, with a regression checking January/February southward and June northward declination. Resolve the shared model-year convention before changing the EBM's default phase. Do not tune a coastal coefficient to compensate for a wrongly phased year.
2. Make the trough report retain all convergence crossings and distinguish pressure minima, actual longitude-dependent trough input, and final wind convergence. The current single strongest-crossing statistic obscures causal diagnosis.
3. With the calendar aligned, test a circulation-dependent tropical western-boundary term against the 6 m/s coefficient control. The 6 m/s candidate improves these scores but has not been validated for monsoons, synthetic planets, alternate geometry seeds, or modeled-temperature inputs.
4. Inspect the winter Atlantic pressure template along individual longitudes, especially how hottest-cell trough selection and asymmetric Hadley amplitudes form the meridional pressure gradient. Ocean-only selection, deleting heat lows, and deleting the linear correction are not supported as standalone fixes by these runs.

Production TypeScript was not changed. The temporary diagnostic copies were removed after the sweeps. Existing repository-convention issues encountered during instrumentation are recorded separately in [the cleanup plan](../../../plans/wind-diagnostic-rule-cleanup.md).
## Verification and scope

- Repeated observed-temperature baselines reproduced the same pooled scores in all five sweeps.
- The calendar-aligned 6 m/s candidate meets the existing trade-speed, NH westerly-speed and land speed-error checks. Deliberately destructive ablations failed their documented checks; no claim is made that every diagnostic variant passed.
- `pnpm typecheck` passed in the main workspace after removing the temporary diagnostics.
- `pnpm lint` passed in an isolated snapshot of the current workspace: 754 files checked, no fixes applied. Isolation prevented the auto-writing command from touching concurrent work.
- No production wind behavior was changed. The report, compressed results, and removal of the temporary diagnostic copies are the deliverables.

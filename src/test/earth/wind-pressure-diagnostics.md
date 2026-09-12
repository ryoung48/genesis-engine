# Wind pressure and circulation diagnosis with observed Earth temperatures

2026-09-11. Diagnostic experiments, not a production change or an end-to-end climate validation.

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

## Next implementation experiments

1. Make the trough report retain all convergence crossings and distinguish pressure minima, actual trough input, and final wind convergence. The current single strongest-crossing statistic obscures causal diagnosis.
2. Replace or constrain the tropical western-boundary addition using the modeled circulation rather than an unconditional seasonal direction. Use the 6 m/s sensitivity as a control, not a claim that one globally tuned constant solves the problem. Preserve speed and monsoon checks alongside vector-error checks.
3. Diagnose winter Atlantic winds before the coastal terms: split meridional velocity into the contributions from north–south pressure gradients and Coriolis turning of east–west gradients; inspect the pressure template along individual longitudes. Keep the linear correction and torque solver available as controlled ablations.


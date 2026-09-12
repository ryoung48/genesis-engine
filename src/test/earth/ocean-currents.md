# Ocean currents

The wind-driven ocean model (`src/model/climate/ocean/currents`) and what the
Earth comparison says about it. Wind-side work is in `wind.md`; land
temperature MAE is `README.md`. Nothing here moves temperature:
`OCEAN_CURRENTS.applySSTToClimate` is commented out in
`post-elevation/index.ts`, so modeled SST is display-only.

```sh
pnpm vitest run --project smoke src/test/earth/earth-real-current-compare.smoke.test.ts --reporter verbose
```

Earth observations (GODAS surface currents, OISST anomalies) are compared
against, never fed in — not in production and not inside tests.

## What was wrong

- **Every current on the map ran backwards.** `buildOceanCurrentGrid` rotated
  the SST gradient the wrong way (`(gy, -gx)` instead of `k x grad(sst)`). The
  speed-weighted direction score against GODAS was negative in all 14 regions
  sampled; global -0.18.
- **Western boundary currents flowed the wrong way.** `psi` never returned to
  zero at a basin's western wall, so the interior's equatorward flow ran right
  up to the coast and the Gulf Stream, Kuroshio, Brazil, Agulhas and East
  Australian currents had the wrong meridional sign.
- **The Pacific was cut in two at the dateline**: the east-to-west sweep
  started at column 359 and treated it as an eastern wall.
- **Raster cells with no mesh cell counted as land** (1-degree cells outrun the
  mesh at high latitudes).
- **SST was an ungated Ekman-pumping table**: eastern-boundary upwelling zones
  came out warm, the North Atlantic Drift cold, correlation -0.07.
- The solver never identified gyres; `psi` was computed, used as a correction
  weight and discarded.

## What is in now

Split into `sverdrup/raster` (mesh <-> 1-degree grid), `sverdrup/circulation`
(wind stress, `psi`, Ekman, surface flow) and `sverdrup/sst-anomaly` (heat
solve).

- **Stored flow.** `GenesisOceanCurrents` carries `flowU/V` plus monthly
  fields, so the overlay draws the solver's own current. The legacy band model
  and the tidally locked model fill the same fields from their SST gradient
  (`ocean/surface-flow`), the rotating one with the corrected rotation.
- **Streamfunction.** Integrated westward from each basin's eastern wall,
  wrapping across the dateline. Walls are land runs of 3+ cells or any
  continent landmark (so Panama blocks, small islands don't). A Munk-width
  boundary layer `(A/beta)^(1/3)` brings `psi` back to zero at the western
  wall — that is the western boundary current. Rows whose longest open-water
  run approaches the globe blend into a circumpolar-channel solution
  (180 -> 300 deg), and `psi` tapers to zero from 70 to 80 deg.
- **Transport depth is the reduced-gravity layer, not a constant.** The
  Sverdrup transport rides in the warm upper layer, so that layer's own
  thickness converts it to a surface speed: a subtropical gyre centre, where
  the thermocline bows down, runs slower than its transport alone suggests.
  `sverdrup/thermocline` owns `h^2 = h_E^2 + 2 f psi / g'` and both callers use
  it -- the transport depth here and the upwelling gate in `sst-anomaly`.
  Where the layer thins past its at-rest thickness (subpolar gyres, the
  circumpolar channel) it no longer confines the flow, which goes barotropic,
  so `h_E` is the floor.
- **Circumpolar channel jet.** A zonally unblocked row has no walls to hold up
  a pressure gradient, and the channel branch of `psi` has its row-mean removed,
  so the Sverdrup solution carries *no net zonal transport at all* -- the model
  had no ACC, only Ekman drift and wiggles. The wind's zonal momentum is
  dissipated against the water instead: `rho_w C_d u^2 = tau_x` on the row-mean
  zonal stress, faded in by the same `channelWeight` and polar taper.
- **Physical units, no percentile normalization.** Wind stress
  `rho_air C_d |U| U` in Pa with air density scaled by surface pressure;
  transport from the planet's own `beta = 2 Omega cos(lat)/a`; Ekman transport
  `tau/(rho f)` with drift over the Ekman depth; 2 m/s cap.
- **Gyres fade on slow rotators** via `1 - WIND.rotationCollapse(hoursPerDay)`,
  the same signal the wind model uses for cell collapse.
- **SST anomaly** is a steady advection-relaxation solve (upwind Gauss-Seidel):
  water carries the background meridional temperature gradient, Ekman upwelling
  cools it, and the upwelled deficit is gated by a reduced-gravity thermocline
  (`h^2 = h_E^2 + 2 f psi / g'`) so upwelling only cools where it can reach
  cold water. The zonal mean is removed to match the observed anomaly's
  definition. Relaxation time comes from `ocean/mixed-layer`.
- **Shared modules extracted**: `ocean/coastal-bleed` (was duplicated three
  times), `ocean/surface-flow`, `ocean/mixed-layer`, and
  `LANDMARKS.regionTypeMask` (lake/continent masks, was duplicated three
  times).

## Where it stands

| Metric (vs GODAS/OISST, procedural winds) | Start | Now |
| --- | ---: | ---: |
| Current direction, 15-60 deg | -0.18 | 0.45 |
| Regions with a positive direction score | 0/14 | 12/13 |
| Regions with correct SST sign | 6/10 | 9/10 |
| ACC direction score | -0.18 | 0.44 |
| ACC mean u (obs 0.090 m/s) | -- | 0.092 m/s |
| ACC peak speed (obs 0.30 m/s) | 1.89 m/s (artifact) | 0.48 m/s |

Removing the fixed 100 m transport depth also removed a compensation: it had
been fitted against winds whose stress is roughly half of observed, so the two
errors cancelled. Western-boundary speeds are now honestly low rather than
accidentally right (Gulf Stream peak 0.14 against 0.49 observed, Agulhas 0.15
against 0.53) and the residual belongs to the wind, not to this model.

Test floors: at least 12 of 13 regions with a positive direction score, global
above 0.3, at least 9 of 10 correct SST signs.

## The wind/ocean split, measured

Driving the solver with observed NCEP winds (a scratch harness, deleted --
observations are compared against, never fed in) separates wind error from
ocean error. Direction score, observed winds vs procedural:

| | obs winds | procedural | | | obs winds | procedural |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| N Atlantic Drift | 0.91 | -0.39 | | Gulf Stream | 0.90 | 0.87 |
| N Eq Current Pac | 0.96 | 0.10 | | Agulhas | 0.89 | 0.81 |
| **ACC** | **0.12** | **0.15** | | California | 0.14 | 0.48 |
| Benguela | 0.24 | 0.73 | | global 15-60 | 0.49 | 0.39 |

Four things came out of it:

- **The North Atlantic Drift and the North Pacific equatorial current are
  purely wind.** Both jump to ~0.95 with observed winds; there is nothing to
  fix on the ocean side for either.
- **The ACC was the one region observed winds did not help** -- which is what
  led to the channel jet above.
- **Surface speed ran 2-3x too fast under realistic forcing** (Brazil 0.353
  against 0.098 observed, Agulhas 0.576 against 0.232) -- which is what led to
  the thermocline transport depth.
- **Eastern-boundary direction gets *worse* with real winds** (California
  0.48 -> 0.14, Benguela 0.73 -> 0.24): stronger alongshore wind drives
  stronger offshore Ekman drift, which swamps a very weak geostrophic flow.
  Reality has an equatorward geostrophic jet there, set up by the density front
  the upwelling itself creates, and `sst-anomaly` consumes the flow without
  ever feeding back into it.

## The barotropic attempt

`psi` is integrated row by row with no meridional coupling, so each row carries
an independent integration error and `u = -d(psi)/dy` differentiates straight
across it. `PSI_SMOOTHING_PASSES` only papers over that (2 -> 4 is +0.04 global
direction, 2 -> 6 is +0.06). The real fix is to stop reducing the vorticity
equation and solve it: spin a rotating ocean up under the wind and let gyres,
boundary currents and the circumpolar jet fall out of one budget, with no basin
detection at all -- which is what arbitrary continents want.

That is built and parked on the `ocean-barotropic-vorticity` branch, not
merged. It runs, and it deletes `barrierMask`, the wall search, `channelWeight`
and `applyWesternBoundary` outright. Six real defects were found and fixed
getting that far:

- **The polar metric.** `dt` sized off the 70-degree spacing while the raster's
  cos(85) cap makes the true polar spacing 9.7 km -- an instant NaN. The zonal
  spacing the operator sees has to be floored where the polar filter acts.
- **Forward Euler is unconditionally unstable on Rossby waves.** The beta term
  is purely oscillatory and explicit Euler amplifies every oscillatory mode at
  any step size. SSP-RK3 is stable on the imaginary axis to |omega| dt <= 1.73.
- **The step bound used half the gravest wavelength.** On a sphere the longest
  wave is one full circumference, k = 1/a, so omega_max = beta a = 2 Omega.
- **A rigid lid leaves the large modes unconstrained.** With a free surface the
  inversion is (lap - 1/L_d^2) psi = q, which pins modes larger than L_d.
- **Centred advection goes unstable in the boundary layer**, where psi falls to
  zero across ~2 cells and the grid Reynolds number passes 2. Upwind the q
  advection; take beta analytically rather than differencing f.
- **Three multigrid defects**: cell-centred restriction against vertex-centred
  latitudes, restriction weights renormalised near coasts (breaking R = c P^T),
  and a coarse mask that marked a point ocean if any neighbour was.

**Where it stops.** Point relaxation cannot damp the smooth basin-scale modes
of the inversion -- `q` sits perfectly steady while `psi` triples -- and near
the equator the stretching term is far too weak to pin them either (the floored
L_d is ~9800 km, wider than a basin). Geometric multigrid fixes that on a
rectangular basin (residual 4.96e-12 -> 1.98e-14, monotone) and **diverges on
Earth's real coastlines** (+2.6x per cycle). The reason is visible in the
hierarchy: ocean points 43147 -> 10856 -> 2740 -> 724 while the coastal
fraction climbs 7.6% -> 12.3% -> 19.5% -> 29.3%. Coarsening mangles narrow
seas, straits and island chains, so the coarse operator stops approximating the
fine one, which is the assumption the whole method rests on.

Finishing it needs Galerkin coarse operators (`A_c = R A P`, derived from the
fine operator instead of rediscretised on a coarsened mask) or an algebraic
method -- or a Krylov solver, which needs no coarse grids at all and is
indifferent to mask shape. Latency, ocean solve only, 12 months: 2.4 s for the
Sverdrup model here, 9.5 s barotropic with point relaxation, 20.5 s with the
(still wrong) multigrid.

## Tried and rejected

- **Percentile normalization of the flow field** (the original behaviour). It
  rescaled the current to a fixed strength however weak the wind, hiding wind
  errors and ignoring rotation rate and planet size. Removing it exposed both.
- **500 m transport depth.** Physically the layer that carries the transport,
  but it put surface speeds ~3x too low (the flow is surface-intensified).
  100 m matches observed interior speeds.
- **Driving the solver with observed NCEP winds in the test.** It isolated the
  ocean physics well (SST correlation 0.43, every upwelling zone cold, 0.71-0.97
  direction per region) but feeds observations into the model, so it and the
  `fromWinds` entry point were removed.
- **Thermocline transport depth without the at-rest floor.** Letting `h` fall
  to its 30 m minimum wherever the layer outcrops made the subpolar gyres and
  the channel explode (ACC peak 1.31 m/s, N Eq Pac direction -0.09, one region
  under the test floor). The 30 m minimum is fine as an upwelling gate and far
  too thin to divide a transport by.
- **Tuning sweeps** on relaxation time (60 days), Ekman drift weight (0.2) and
  upwelling strength/gating (k=2, 0.2 C/day): each helped one region and hurt
  another; the defaults (30-day relaxation pre-physical-units, 0.5 drift, k=1)
  survived until physical units replaced them.

## Worth exploring next

- **Eastern-boundary upwelling is still ~15x too weak** (Benguela -0.4 C vs
  -5.7 C). Not, as previously recorded here, because the wind model lacks
  equatorward alongshore wind -- `wind-monsoon-upwelling` shows California's
  alongshore direction is if anything stronger than observed. It is wind
  *speed*: the whole 15-35 deg subtropical belt runs at 0.6-0.75 of observed
  in every basin, which is 0.4-0.55 in stress, and coastal alongshore stress
  comes out 4-13x low (Benguela 0.006 Pa against 0.059 Pa). Observed winds
  recover most of it (Benguela -3.1 C, Humboldt -2.5 C), so it is wind-side --
  but the cause is the subtropical highs, not the trough.
- **The 15-35 deg belt is unmeasured.** `earth-real-wind-compare` scores 0-30
  and 30-60; each straddles a well-behaved half and this bad half and averages
  it away. A subtropical band scored on stress rather than speed would make it
  visible.
- **Eastern-boundary geostrophic response.** See the split above: the upwelling
  front should drive an equatorward jet, and nothing carries SST back into the
  flow.
- **North Atlantic Drift still has the wrong sign**, because the model's
  westerly jet sits ~15 deg equatorward of the real one over the Atlantic,
  putting that region in the subpolar gyre. Also wind-side.
- **Ekman transport still grows as 1/f on slow rotators**, capped only by the
  2 m/s speed limit. Replacing the 8-degree floor with a friction + Coriolis
  balance (the form the wind model already uses) would handle the equator and
  slow rotators in one expression.
- **Earth-calibrated constants that should come from the planet**: the 6 C
  upwelled deficit (should follow the planet's surface-to-deep contrast), the
  100 m surface depth and 0.02 m/s^2 reduced gravity (stratification), the
  50 m Ekman depth, and the water properties in `ocean/mixed-layer`.
- **`OCEAN_DRAG_COEFFICIENT` and the 900 m thermocline cap** are the two
  constants the channel jet and transport depth added; both should follow the
  planet rather than sit at Earth values.
- **No non-Earth test.** A sanity smoke test on a slow rotator, a retrograde
  world, a small planet and a water world (finite, bounded, gyres turning the
  right way) would catch regressions the Earth test cannot.
- **Gyre identification.** `psi` contains the gyres; labelling connected
  same-sign regions would give named gyres and their rotation for gameplay or
  display.
- **Tidally locked display**: `buildLockedOceanCurrentGrid` draws flow as the
  SST gradient rotated 90 degrees while its original comment described the raw
  warm-to-cold gradient. Behaviour was preserved; the intent is undecided.

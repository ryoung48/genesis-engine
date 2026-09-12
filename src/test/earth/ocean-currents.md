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
- **Streamfunction, as a sparse linear solve.** The steady linear barotropic
  balance `R lap(psi) + J(psi, f) = curl(tau)/rho` -- with `J(psi, f) = beta
  d(psi)/dx` -- discretised five-point over wet cells only and handed to
  BiCGSTAB (`sverdrup/stommel`). Land never becomes an unknown, so `psi = 0`
  on every coast falls out of the numbering itself.

  **This deleted all the basin detection.** No `barrierMask`, no wall search,
  no segment scan, no `channelWeight` blend, no post-hoc western-boundary
  exponential, no polar taper. Gyres, western boundary currents and the
  circumpolar jet are all just what the operator produces, which is what
  arbitrary continents need: the western boundary current is a property of the
  solution rather than a shape multiplied onto it, and the ACC emerges with no
  channel term at all.

  **The operator is identical for all twelve months; only the forcing changes.**
  Since the system is linear, the year's curl is written as a mean plus one
  annual harmonic and the response of each mode solved separately, then
  recombined per month: `psi(t) = psi_0 + psi_c cos(wt) + psi_s sin(wt)`. Three
  solves instead of twelve, and the reconstruction is exact -- the only
  approximation is how well three modes represent the forcing, which is
  measured, not assumed. Against solving all twelve: direction and SST
  correlation are unchanged to two decimals and the ACC moves 0.74 -> 0.73.
  Mean-only (one solve) does lose SST correlation, 0.39 -> 0.36.

  Everything downstream of `psi` stays per-month, because none of it is linear
  in `psi`: the thermocline takes a square root, the surface speed divides by
  it and is capped.

  The drag `R` sets the Stommel layer `R/beta`. A physical layer (~50 km) is
  far narrower than a 1-degree cell, so it is instead set to two cells -- a
  resolution floor, not a physical claim -- written as `2 Omega dlambda cos^2`
  so it follows the planet's rotation and the raster's spacing. That also fixes
  the cell Peclet number at 1/2, well inside the stability limit of 2, so
  centred differencing needs no upwinding.
- **Transport depth is the reduced-gravity layer, not a constant.** The
  Sverdrup transport rides in the warm upper layer, so that layer's own
  thickness converts it to a surface speed: a subtropical gyre centre, where
  the thermocline bows down, runs slower than its transport alone suggests.
  `sverdrup/thermocline` owns `h^2 = h_E^2 + 2 f psi / g'` and both callers use
  it -- the transport depth here and the upwelling gate in `sst-anomaly`.
  Where the layer thins past its at-rest thickness (subpolar gyres, the
  circumpolar channel) it no longer confines the flow, which goes barotropic,
  so `h_E` is the floor.
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

| Metric (vs GODAS/OISST, procedural winds) | Start | Sverdrup | Stommel solve |
| --- | ---: | ---: | ---: |
| Current direction, 15-60 deg | -0.18 | 0.45 | **0.57** |
| Regions with a positive direction score | 0/14 | 12/13 | **13/13** |
| Regions with correct SST sign | 6/10 | 9/10 | 9/10 |
| SST correlation, 15-60 deg | -0.07 | -0.11 | -0.05 |

Under observed wind, which is where the ocean model is judged on its own
(`earth-current-obswind.diagnostic.smoke.test.ts`): direction 0.60 -> **0.68**,
SST correlation 0.25 -> **0.39**.

Every region improved or held. The largest: N Atlantic Drift -0.39 -> 0.03 (the
last negative one), N Eq Current Pac 0.07 -> 0.44, ACC 0.44 -> 0.67, Agulhas
0.80 -> 0.91, Humboldt 0.59 -> 0.69. The ACC is the notable one, since the
channel jet that used to carry it is gone -- the solve produces a circumpolar
current on its own, and its mean u is 0.039 against 0.090 observed where the
jet had been tuned to 0.092.

**Speeds are now systematically low** (Gulf Stream peak 0.13 against 0.49,
Agulhas 0.09 against 0.53). Two causes, both known: the two-cell drag is ~4x
the physical Stommel width, and procedural wind stress is about half observed.
Direction is what the ocean model controls and what the floors hold.

The ACC across this session (the "Start" column above predates it, and no
per-region direction score was recorded then):

| ACC 45-60S | Sverdrup | + channel jet | Stommel solve | Observed |
| --- | ---: | ---: | ---: | ---: |
| direction score | 0.12 | 0.44 | 0.67 | -- |
| mean u | 0.032 | 0.092 | 0.039 | 0.090 m/s |
| mean v | 0.006 | 0.003 | 0.007 | 0.055 m/s |
| peak speed | 0.61 | 0.48 | 0.43 | 0.30 m/s |

The jet had been tuned to match `u` almost exactly while contributing nothing
meridional; the solve scores far better on direction with less than half the
zonal speed, because it gets the *structure* right rather than the magnitude.
`v` is still an order of magnitude short: the real ACC meanders -- (0.090,
0.055) points 31 degrees north of due east -- because it is steered by
bathymetry the model does not have.

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
- **The ACC was the one region observed winds did not help.** That first led
  to a hand-built channel jet; the Stommel solve now produces a circumpolar
  current on its own and scores better than the jet did, so the jet is gone.
- **Surface speed ran 2-3x too fast under realistic forcing** (Brazil 0.353
  against 0.098 observed, Agulhas 0.576 against 0.232) -- which is what led to
  the thermocline transport depth.
- **Eastern-boundary direction gets *worse* with real winds** (California
  0.48 -> 0.14, Benguela 0.73 -> 0.24): stronger alongshore wind drives
  stronger offshore Ekman drift, which swamps a very weak geostrophic flow.
  Reality has an equatorward geostrophic jet there, set up by the density front
  the upwelling itself creates, and `sst-anomaly` consumes the flow without
  ever feeding back into it.

## The time-dependent barotropic attempt

Before the steady solve above, the same goal was attempted with a time-stepped
nonlinear barotropic vorticity model -- `dq/dt + J(psi, q+f) = curl(tau)/(rho H)
+ A lap(q) - r q` -- spun up from rest each month. It reached the same
structural result (no basin detection) and is parked, unmerged, on the
`ocean-barotropic-vorticity` branch. The steady solve supersedes it: it is
cheaper, it converges unconditionally, and it needs no time step, no
spin-up, no polar filter and no stability analysis.

The nonlinear term is the one thing it had that the steady solve does not, so
it is where inertial recirculation and jet separation would have to come from
if those are ever wanted. Six real defects were found and fixed getting it as
far as it went, all worth knowing before anyone tries again:

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

The Krylov solver the steady formulation now uses is the resolution of this:
it needs no coarse grids at all and so is completely indifferent to mask shape.
Latency, ocean solve only, 12 months: 2.2 s for the old row integration, 9.5 s
time-stepped with point relaxation, 20.5 s with the (still wrong) multigrid,
and 9.1 s for the steady sparse solve that shipped.

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
- **The ACC does not meander** (v = 0.007 against 0.055 observed), and the
  drag is linear where the real balance is form drag on topography. Both are
  the same missing bathymetry.
- **Further solver work has little headroom left.** The 3.5 s splits as ~1.9 s
  fixed (twelve wind fields, twelve surface steps, twelve SST-anomaly
  Gauss-Seidel solves) and ~1.6 s of Krylov, measured by the slope across
  harmonic counts: 2.6 s at 1 solve, 3.5 s at 3, 5.4 s at 5, so 3.66 ms per
  iteration on a 1.91 s intercept. ILU(0) could take at best a second off the
  total. The **SST anomaly solve is now a peer cost** to the current solve --
  200 Gauss-Seidel sweeps x 12 months over 65160 cells -- and is the better
  target.
- **A sparse direct factorisation** is tempting at 43k unknowns (factor once,
  twelve backsolves) but the natural ordering has bandwidth ~360, so banded LU
  is ~5.6e9 flops; it needs nested-dissection or AMD ordering to pay, which is
  a lot of machinery for under a second of headroom.
- **Halving the solve resolution** interacts badly with the drag: the Stommel
  layer is already only two cells, and a coarser grid at the same cell count
  means a physically wider layer. One cell measured worse than two, so this
  trades accuracy for time in the direction already known to hurt.
- **The equatorial band got worse**, not better (direction 0.22 -> 0.06 under
  observed wind). The Stommel balance degenerates as `beta d(psi)/dx` stops
  being the leading term near the equator, which is the one place this
  formulation is known not to apply.
- **`STOMMEL_LAYER_CELLS` is a resolution floor, not physics.** Two cells is
  ~4x the real Stommel width and damps every current; one cell scored worse
  (direction 0.68 -> 0.64, ACC speed 0.270 against 0.114 observed), so the
  answer is finer resolution rather than less drag. The 900 m thermocline cap
  is the other constant that should follow the planet.
- **No non-Earth test.** A sanity smoke test on a slow rotator, a retrograde
  world, a small planet and a water world (finite, bounded, gyres turning the
  right way) would catch regressions the Earth test cannot.
- **Gyre identification.** `psi` contains the gyres; labelling connected
  same-sign regions would give named gyres and their rotation for gameplay or
  display.
- **Tidally locked display**: `buildLockedOceanCurrentGrid` draws flow as the
  SST gradient rotated 90 degrees while its original comment described the raw
  warm-to-cold gradient. Behaviour was preserved; the intent is undecided.

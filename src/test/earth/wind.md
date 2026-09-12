# Wind

## Shallow-water follow-up

The nonlinear shallow-water solver is now the active large-scale wind solver.
Its former `1000` geopotential-per-template conversion over-accelerated the
flow and ignored atmospheric pressure. The conversion is now 275 m2/s2 per
template unit at one bar and is multiplied by the same pressure response used
by the local wind balance. This is a model-unit calibration; radius and
rotation still enter through the physical shallow-water equations.

Shallow mode now keeps total pressure separate from the coarse-grid residual.
Previously it returned the residual as if it were total pressure and used that
residual to gate eastern-boundary flow. The local balance receives the residual,
while pressure diagnostics and the offshore-high gate receive total pressure.

The uninterrupted-ocean fetch response was increased without using a
hemisphere or Earth latitude condition. On the Earth comparison this makes the
modeled 40-60S ocean belt faster than the modeled southern trades while keeping
its observed-speed ratio at 0.71.

Mountain elevation now enters the coarse shallow-water equations as reduced
transport depth and added form drag. The blocking thresholds are normalized to
the world's own relief, so ranges redirect mass transport without Earth-specific
locations or elevations. A synthetic north-south ridge test shows less flow
through the ridge and more flow around its ends. At the current 2-degree grid,
the Earth comparison took about 2-3% longer in a direct before/after run.

With observed Earth temperature input, compared with the preceding linear
solver:

| Metric | Linear | Shallow water |
| --- | ---: | ---: |
| Ocean vector error | 3.201 m/s | 3.189 m/s |
| Ocean speed ratio | 0.83 | 0.90 |
| Ocean mean absolute speed error | 2.07 m/s | 2.01 m/s |
| Ocean direction cosine | 0.448 | 0.440 |

### Steady-solver experiment

A controlled observed-temperature ablation kept forcing, terrain, surface
conversion, fetch adjustment, and scoring unchanged:

| Solver | Vector error | Speed ratio | Speed MAE | Direction cosine | Test time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full shallow water | 3.189 m/s | 0.90 | 2.01 m/s | 0.440 | 52.3 s |
| No momentum advection | 3.206 m/s | 0.89 | 2.02 m/s | 0.436 | 48.1 s |
| No advection or viscosity | 3.235 m/s | 0.91 | 2.04 m/s | 0.435 | 39.5 s |
| Terrain-aware steady prototype | 3.250 m/s | 0.93 | 2.03 m/s | 0.436 | 40.8 s |
| Existing exact spectral solve, current fetch | 3.221 m/s | 0.86 | 2.06 m/s | 0.448 | 38.1 s |

The experiment supports global steady coupling as a promising optimization,
but does not support replacing shallow water yet. Advection and viscosity each
make small measurable improvements, and the attempted variable-coefficient
steady discretization lost more accuracy than it saved. Its first unpreconditioned
linear solve also stalled on sharp terrain; diagonal preconditioning fixed
convergence, and terrain-normal form drag recovered synthetic ridge diversion,
but the Earth score remained worse. The prototype was therefore not retained.

The next steady implementation should extend the existing spectral operator or
use it as a preconditioner for longitude-varying terrain. It must beat the full
solver's 3.189 m/s vector error, retain the ridge-diversion test, and reduce the
observed-temperature test time before replacing shallow water.

### Runtime follow-up

The explicit solver now checks its normalized RMS equation tendency every eight
steps after 3.5 times the slower drag or radiative-relaxation timescale and stops
after three converged checks. That is seven days with the current two-day
timescales, but scales when those inputs become planet-derived. Checking
intermittently avoids adding a full residual cost to every timestep. The
gravity-wave CFL was increased from 0.5 to 0.6, which remains below the
two-dimensional C-grid stability limit for the current update.

The large-scale grid was changed from 2 degrees to 3 degrees. The mesh-level
residual still restores local pressure and terrain structure. Direct runs of
the twelve-month observed-temperature comparison were:

| Large-scale grid | Wind time | Ocean vector error | Direction cosine |
| --- | ---: | ---: | ---: |
| 2 degrees | 12.67 s | 3.190 m/s | 0.440 |
| 3 degrees | 9.39 s | 3.211 m/s | 0.440 |
| 4 degrees | 8.48 s | 3.229 m/s | 0.441 |

The 3-degree grid is retained because it reaches the sub-10-second target with
about half the accuracy loss of the 4-degree grid. It retains at least 15%
cross-range suppression and 5% around-range acceleration in the synthetic
mountain test.

The remaining important mismatch is torque calibration: Hadley pressure is
still balanced with the steady local response before the nonlinear solver runs.
A future iteration should measure torque from shallow-water surface stress and
adjust the Hadley components against that response.

Follow-up: [pressure/circulation diagnosis with observed Earth temperatures](wind-pressure-diagnostics.md) identifies a seasonal-calendar mismatch and isolates the western-boundary flow contribution. The original investigation below predates those controlled experiments.

Changes to `src/model/climate/weather/wind` driven by the ocean-current work,
and what the Earth comparison says about them. Ocean-side work is in
`ocean-currents.md`; land temperature MAE is `README.md`.

```sh
pnpm vitest run --project smoke src/test/earth/earth-real-wind-compare.smoke.test.ts --reporter verbose
```

The comparison runs both modeled-temperature and observed-temperature cases.
The observed case uses WorldClim/NCEP monthly air temperatures, preserves the
existing terrain correction when constructing sea-level temperatures, and
recomputes annual means. It derives solar declination through `INSOLATION`
with an explicit nominal January 1 solar longitude of 280.38 degrees, based on
JPL's J2000 Earth orbital elements, then averages daily samples over non-leap
calendar months. This is a conditional wind diagnostic; the modeled-temperature
case retains the generated climate's own temperature and declination inputs.

`src/test/insolation-phase.smoke.test.ts` checks phase shifts on a circular
orbit, zero tilt at several starting phases, and unequal season lengths on
eccentric orbits. The default planetary epoch and wind coefficients are unchanged.

Observed NCEP winds are compared against, never fed in. The wind model also
receives no SST or ocean-current input: wind drives the ocean one way, and
there is no coupling loop. Anything the real atmosphere gets from ocean
temperature patterns has to come from the wind model's own inputs (EBM
temperature, land-sea contrast, geography, planet parameters) or not at all.

## What was wrong

- **Ocean winds were never scored.** `earth-real-wind-compare` compared land
  cells only, so the winds the ocean depends on were unmeasured.
- **Trades ran at about half speed over the ocean** (0.62 / 0.67 of NCEP north
  and south), while the northern westerlies were about right (1.01).
- **The North Atlantic westerly jet sits ~15 deg too far equatorward** (peak
  40-45N vs 45-55N observed; the trades-to-westerlies switch near 28N instead
  of ~37N). The North Pacific jet is ~5 deg too far poleward, so this is not a
  uniform bias.
- **Cross-equatorial trades reverse with the seasons.** Annual wind steadiness
  (|annual mean vector| / mean speed) within 10 deg of the equator was 0.20
  and 0.47 against 0.65 and 0.61 observed, with annual direction errors of
  76-94 deg. Visible over the equatorial Atlantic and eastern Pacific in
  November-February.
- **The Atlantic trough runs 10-20 deg south of even its own thermal equator**
  in October-December, reaching -24 deg.

## What is in now

- **Surface torque balance** (`wind/torque-balance`). The template sets each
  cell's pressure drop from the zonal-mean temperature contrast across it, and
  the Hadley cell spans the flattest part of that curve (~6 C against ~13 C
  across the Ferrel cell), so the trades came out weak. In steady state the
  atmosphere exerts no net torque on the planet, so each hemisphere's Hadley
  pressure is rescaled until its surface torque vanishes (clamped 0.5-3x).
  `computePressureField` returns the Hadley increment separately, flat poleward
  of the ridge, so scaling it leaves the Ferrel and polar gradients alone.
- **Storm gustiness in the drag**: `sqrt(U^2 + sigma^2)` with sigma a quarter
  of the thermal wind across one scale height (`R_d |dT/dy| / f`, capped at
  10 m/s), faded in across the Hadley edge and switched off as the cells
  collapse. Monthly-mean winds carry no transient storms, so without it the
  balance under-asks the trades.
- **Trough thermal inertia** (`wind/ocean-inertia`). The ocean cells the
  trough follows are a first-order response to the preceding months on the
  mixed layer's ~79-day relaxation time (`ocean/mixed-layer`), scaled by the
  planet's own month length. The subtropical ridge deliberately stays on the
  monthly temperature.
- **`WIND.rotationCollapse(hoursPerDay)`** extracted from the cell-collapse
  blend so the ocean can fade its gyres on the same signal.
- **`wind/surface-balance`** extracted (mesh gradient, friction + Coriolis
  balance), shared by the main wind loop and the torque solve.
- **Ocean scoring in the test**: per-band ocean rows, a mean vector error
  (|model wind - observed wind|), pooled ocean and land summaries, plus
  report-only tables for annual steadiness, surface trough latitude by month
  and basin, and the model's land-inclusive and ocean-only thermal equators.
  Floors: ocean trades above 0.75 each hemisphere, ocean westerlies 0.85-1.2,
  pooled land speed error at most 1.4 m/s.

## Where it stands

| Metric (vs NCEP) | Start | Now |
| --- | ---: | ---: |
| Ocean trades 0-30N / 0-30S, speed ratio | 0.62 / 0.67 | 0.87 / 0.83 |
| Land trades 0-30N / 0-30S, speed ratio | 0.66 / 0.79 | 0.99 / 1.08 |
| Ocean westerlies 30-60N, speed ratio | 1.01 | 1.02 |
| Ocean vector error, pooled | 3.356 m/s | 3.274 m/s |
| Land vector error, pooled | 2.241 m/s | 2.228 m/s |
| Ocean direction cos, pooled | 0.423 | 0.435 |
| Steadiness 10S-0 / 0-10N (obs 0.65 / 0.61) | 0.20 / 0.47 | 0.30 / 0.53 |

## Tried and rejected

- **Splitting the Hadley pressure as a cumulative offset.** The offset picked
  up the per-boundary land amplitudes, so scaling it also steepened the Ferrel
  gradient: westerlies inflated to 1.25x and direction north of 60N fell from
  0.29 to 0.16. Fixed by making the Hadley component flat poleward of the
  ridge.
- **Gust scaled per degree of latitude.** Ignores planet radius and rotation;
  replaced by the per-metre thermal-wind form.
- **Thermal-wind gust without the Hadley-edge fade.** With f in the
  denominator it put ~4 m/s of gust inside the tropics, which fed easterly
  drag into the torque balance and dropped the trades to 0.76 / 0.74 — under
  the floor.
- **Lagging the subtropical ridge as well as the trough.** Bigger trade gains
  (ocean vector error 3.239 m/s) but 0.04-0.05 worse direction north of 60N
  and worse 30-60S. Trough-only keeps most of the gain with no regressions.
- **Seasonal boundary-flow terms as the cause of the equatorial reversal.**
  Zeroing the western (8 m/s) and eastern (6 m/s) terms moved 10S-0 steadiness
  only 0.20 -> 0.24 and left the direction errors, while costing enough trade
  speed to fail the floor. Both were restored.
- **Placing the trough on the ocean-only thermal equator.** The measurement
  killed this before it was written: the ocean-only thermal equator swings as
  far south as the land-inclusive one (-13 to -14 deg in the Atlantic in
  December-January).

## Worth exploring next

- **The Atlantic trough overshoot** is the largest remaining error that sits
  entirely inside the wind model. Switch off the continental heat lows, the
  western-boundary flow and the large-scale correction in turn to find what
  pulls the trough 10-20 deg south of its own thermal equator.
- **The northward ITCZ offset cannot come from the wind model.** The real
  trough sits ~+7 deg year round over the Atlantic and East Pacific because of
  the cold tongue and cross-equatorial ocean heat transport. The EBM's thermal
  equator is symmetric about the equator (+/-14 deg, one-month lag) and its
  ocean temperatures were never fitted (the greenhouse term was fit land-only).
  Options: an EBM cross-equatorial heat-transport term from basin geometry,
  deeper low-latitude ocean heat capacity, or accept a trough centered on the
  equator.
- **Southern Ocean westerlies are weak** (0.70 of observed), which caps the
  southern trades through the torque balance.
- **Annual wind direction is 27-60 deg off in the 10-30 deg belts**, tied to
  the shape of the subtropical highs rather than the trough.
- **Gust sigma ignores stratification.** The thermal-wind form uses R_d, dT/dy
  and f but assumes Earth-like static stability and dry-air R_d.
- **Jet latitude is basin-specific** (Atlantic 15 deg equatorward, Pacific 5
  deg poleward), so a hemispheric baroclinic-jet rule would not fix it.
- **`earth-axial-tilt-90` fails** (global mean 14.06 C at 90 deg tilt vs 12.92
  C baseline, expected colder). Nothing in this session's wind or ocean work
  can reach land temperature; the likely source is uncommitted EBM,
  insolation or cloud-modifier work.

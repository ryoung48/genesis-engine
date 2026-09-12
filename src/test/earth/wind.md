# Wind

Changes to `src/model/climate/weather/wind` driven by the ocean-current work,
and what the Earth comparison says about them. Ocean-side work is in
`ocean-currents.md`; land temperature MAE is `README.md`.

```sh
pnpm vitest run --project smoke src/test/earth/earth-real-wind-compare.smoke.test.ts --reporter verbose
```

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

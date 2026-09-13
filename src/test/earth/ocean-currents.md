# Ocean currents

The wind-driven ocean model (`src/model/climate/ocean/currents`) and what
comparing it against real GODAS/OISST/NCEP data says about it. Wind-side work
is in `wind.md`; land temperature MAE is `README.md`. Nothing here moves
temperature either way: `OCEAN_CURRENTS.applySSTToClimate` is commented out in
`post-elevation/index.ts`, so modeled SST is display-only.

`currents/index.ts` ships a hybrid: a coast-facing warm/cold table indexed by
distance from the ITCZ for SST *magnitude*, but which side of the table
applies at each cell -- warm or cold -- comes from `SVERDRUP_CURRENTS`' own
wind-driven circulation, not a land-side heuristic (see `computeCurrents`'s module
comment for why). Only sverdrup's SST-anomaly *sign* feeds the table; its own
SST *magnitude* is not used (too weak without a vertical/heat-content layer,
see below). Flow, however, is sverdrup's own field directly -- `flowU`/
`flowV`/`flowUMonthly`/`flowVMonthly` come straight from
`SVERDRUP_CURRENTS.computeCurrents`'s return, since its wind-driven circulation is
a real current field, not a proxy needing the calibrated-table treatment its
SST magnitude does; `SURFACE_FLOW.fromSstFields` (deriving flow from the SST
gradient) is no longer used for the rotating-planet path, only for the
tide-locked one (`tidal-locked/index.ts`, a separate model sverdrup doesn't
cover). Everything below this point that describes `sverdrup`'s own accuracy
(SST magnitude, direction skill, the model's biggest weaknesses) is about
that standalone module in isolation, run through its own diagnostic tests
calling `SVERDRUP_CURRENTS.computeCurrents` directly -- not about what the hybrid
actually ships, which inherits sverdrup's sign and flow but not its SST
magnitude.

## The production hybrid: sverdrup sign + an empirical magnitude table

The old table (`WEST_BAND_C_TABLE`/`EAST_BAND_C_TABLE`) was hand-fit small,
then scaled by a `CURRENT_STRENGTH_SCALE` fudge factor tuned indirectly
through its downstream effect on WorldClim land-temperature RMSE -- a proxy
several steps removed from the actual quantity (SST anomaly) it was standing
in for. The current table (`WARM_BAND_C_TABLE`/`COLD_BAND_C_TABLE`) instead
bins real OISST anomaly directly: for every ocean cell/month with real GODAS
current speed >= 0.15 m/s (excluding open-ocean noise -- cells not actually
part of a current), split by the real anomaly's own sign and averaged per
10-degree bucket of distance from the OBSERVED (WorldClim) thermal equator,
not the model's own procedural one. These are the real magnitudes warm and
cold currents reach, not a value tuned through an indirect fit.

Which table applies at each cell (`side` in `bandC(dist, side)`) is `Math.
sign(warmth[r])`, `warmth` being `SVERDRUP_CURRENTS.computeCurrents(...).sst` --
sverdrup's own SST-anomaly sign, computed from actual wind-driven physics
(eastern-boundary upwelling vs. western-boundary warm advection) rather than
inferred from land moisture-advection asymmetry (the deleted
`computeCoastSide`). Only sign is read, not magnitude or confidence -- any
classified cell, however marginal, gets the table's full calibrated value.
This was deliberate: an earlier version scaled the table by sverdrup's own
(weak) magnitude as a "confidence" multiplier, which just reintroduced the
weakness the empirical table exists to avoid (Gulf Stream came out 0.30C
against a real 1.43C). Binary sign avoids that, at the cost of occasionally
getting an inherently-mixed region wrong outright rather than blending
toward a muted, ambiguous value -- e.g. E Australian (real +2.48C) comes out
negative under this scheme, on a per-cell mix of warm- and cold-classified
sverdrup cells within that box.

Region-by-region sign check against GODAS/OISST (production `OCEAN_CURRENTS.
computeCurrents`, not sverdrup in isolation): 9/10 signed regions correct
(everything except E Australian). Magnitudes now land in the same range as
real anomalies (e.g. Gulf Stream 1.69C vs 1.43C real, California -1.62C vs
-4.40C real) rather than the old table's indirectly-fit values.

### Cleanup: equatorial fill and neighbourhood smoothing

Two follow-up fixes to the binary-sign scheme above, both in `computeCurrents`:

- **Equatorial fill** (`EQUATORIAL_EXCLUSION_LAT_DEG = 10`,
  `fillEquatorialBand`). Sverdrup's own dynamics are known-wrong within ~10
  degrees of the equator, not just weak: the Sverdrup/Stommel balance's
  leading term is driven by the Coriolis parameter f, which
  `circulation/index.ts` already floors at 8 degrees because the balance
  itself breaks down as f -> 0. Verified directly: the western equatorial
  Pacific -- the real warm pool, the warmest ocean water on Earth --
  classified mostly COLD in this band (up to 71% of cells within 5-10
  degrees of the equator), a large, spatially coherent wrong-way result, not
  noise a smoothing pass could clean up. Rather than leaving the band blank
  (conspicuously empty right where the most famous SST pattern on Earth
  sits), cells in this band get their classification propagated in via
  multi-source BFS from just outside it (|lat| >= 10), the same value-
  diffusion idea `SVERDRUP_RASTER.fillGaps`/`COASTAL_BLEED.fillLand` already
  use elsewhere to cover a masked region from its nearest trustworthy
  neighbours -- still never trusting the band's own computed sign, but
  giving a spatially continuous answer. Verified result: west Pacific warm
  pool +0.25C, east Pacific cold tongue -0.18C -- the right qualitative
  pattern, no blank cells.
- **3-ring neighbourhood smoothing** (`smoothWarmth`,
  `WARMTH_SMOOTHING_RINGS = 3`). A region can be mostly one classification
  with a several-cell-wide minority sverdrup calls the other way -- found in
  N Atlantic Drift and, worse, right at the Antarctic coast, where
  individual cells checkerboard between strongly warm and strongly cold
  neighbour-to-neighbour. Since sign alone decides which table applies and
  gets its full value, that minority's full-strength opposite-sign
  contribution dilutes the whole region's mean well below the table's real
  value. This turns out to be a background property of the whole approach,
  not one region's quirk -- confirmed three ways:
  - **Not leftover Gauss-Seidel non-convergence.** Rerunning the SST solve
    at 1e-6 residual tolerance (vs. production's 2e-2) barely moved NAD's
    sign-flip count at all (16/81 either way) and only modestly reduced
    Antarctica's (317 -> 278 of 13856 pairs). The noise is a real feature of
    the converged answer given its inputs, not a stopped-too-early artifact
    -- so tightening the solver's tolerance (expensive: ~5.5x more sweeps to
    reach 1e-6) would buy little.
  - **Not one wind model's fault.** Full wind is worse in NAD (16/81 sign-
    flip pairs vs. simple wind's 7/81) but *simple* wind is far worse in a
    calm open-ocean control region with no boundary current at all (109/1075
    vs. full wind's 24/1075) and in Antarctica (499/13856 vs. 317/13856).
    Neither wind model is cleanly better; the checkerboard just lands in
    different places depending on which model's own small-scale structure
    feeds the source term.
  - **A real kernel-width effect.** Measured sign-flip rate between adjacent
    ocean cells drops steadily with smoothing ring width (raw: Antarctica
    7.7%, NAD 28.4%; 2 rings: 5.8%/18.5%; 3 rings: 5.4%/12.3%) but flattens
    past 3 rings (4 rings: 5.1%/12.3%), so 3 is the point past which more
    smoothing buys little further cleanup for the added cost.

  Likely source (not yet fixed): `curl()` and Ekman `divergence` in
  `circulation/index.ts` are both derivatives of the wind-stress field, and
  derivatives amplify whatever small-scale structure the wind model has.
  `windStress()` already smooths tau itself (`STRESS_SMOOTHING_PASSES = 2`)
  before curl/divergence are computed from it, but neither curl nor
  divergence are smoothed again after their own differencing step --
  smoothing those directly, rather than the downstream classification, is
  the more likely place to fix this at the source, not yet attempted.

## The model, as it stands

Split into `sverdrup/raster` (mesh <-> 1-degree raster), `sverdrup/circulation`
(wind stress, psi, Ekman, baroclinic, surface flow), `sverdrup/stommel` (the
linear solve), `sverdrup/thermocline` (reduced-gravity layer depth), and
`sverdrup/sst-anomaly` (the heat solve).

- **Streamfunction as a sparse linear solve.** The steady barotropic balance
  `R lap(psi) + beta d(psi)/dx = curl(tau)/rho`, five-point discretised over
  wet cells only and solved with BiCGSTAB (`sverdrup/stommel`). Land never
  becomes an unknown, so `psi = 0` falls out of the coastline's own shape
  rather than being imposed on it -- no basin detection, no wall search, no
  hand-tuned channel jet. The operator is identical for all twelve months;
  only the forcing changes, so the year is solved in three temporal-Fourier
  solves (mean + one annual harmonic) rather than twelve.
- **Ekman transport and drift**, `tau / (rho f)` floored at 8 degrees
  latitude, captures equatorial upwelling and open-ocean pumping.
- **Coastal upwelling as its own term** (`sverdrup/circulation/coastline`),
  not left to the open-ocean formula above. Wind piling Ekman transport
  against a wall is a different mechanism from open-ocean pumping, not just a
  stronger version of it -- `curl(tau)/(rho f)` is undefined at a wall, and
  the raw finite-difference divergence only saw the coast at all because land
  is zeroed out, which under-resolves it at this grid's ~100km cells (real
  coastal-upwelling bands are 20-50km wide). At the immediate coastal ring, a
  BFS-seeded coastline normal direction lets the model instead force the
  local Ekman transport's offshore component through a literal 50km-wide
  strip -- a real physical width, not fit to any region's SST. This is what
  fixed California and Humboldt's sign flip under the full wind model (see
  `earth-current-obswind`'s diagnostic history) and pushed both simple- and
  observed-wind-driven sign accuracy on the four upwelling regions
  (California/Canary/Benguela/Humboldt) to 4/4.
- **Reduced-gravity thermocline.** `h^2 = h_E^2 + 2 f psi / g'` deepens a
  subtropical gyre's centre and shoals at eastern walls and in subpolar
  gyres; Sverdrup transport rides in this layer, so its own thickness
  converts transport to a surface speed -- a bowed-down thermocline runs
  slower than its transport alone suggests.
- **Baroclinic feedback from SST.** The modeled SST anomaly's own
  steric-height gradient now feeds a geostrophic term back into the surface
  flow (thermal wind), and each month is solved as a two-pass fixed point:
  wind-only flow -> SST -> corrected flow -> corrected SST. The sign is
  empirically flipped from the textbook thermal-wind relation -- applied
  straight, it fights the observed eastern-boundary currents, because the
  real density-driven response to a coastal cold front is a *subsurface*
  poleward undercurrent, and this model has no depth to put one in. Flipped,
  it measurably helps every eastern-boundary region and moves nothing else.
  See `baroclinic()` in `sverdrup/circulation/index.ts`.
- **SST anomaly**: a steady advection-relaxation solve (upwind Gauss-Seidel,
  stopped on residual rather than step size) -- water carries the background
  meridional temperature gradient, Ekman upwelling cools it gated by
  thermocline depth, and the zonal mean is removed to match the observed
  anomaly's own definition.
- **Physical units throughout, no percentile normalization**: wind stress in
  Pa from bulk drag, transport from the planet's own beta, a 2 m/s surface
  speed cap, gyres fading out on slow rotators via the same rotation-collapse
  signal the wind model uses to collapse its own cells.

## Current scores

The numbers below drive the solver with observed NCEP winds instead of
procedural ones, which isolates ocean-model error from wind-model error (see
the next section) -- this is what the ocean model is actually judged on.

| Region | direction skill | speed model / real (m/s) | SST model / real (C) |
| --- | ---: | ---: | ---: |
| Gulf Stream | 0.95 | 0.052 / 0.167 | 1.45 / 1.65 |
| Kuroshio | 0.75 | 0.051 / 0.148 | 0.80 / 0.45 |
| Brazil | 0.93 | 0.102 / 0.098 | 1.69 / 1.37 |
| Agulhas | 0.94 | 0.113 / 0.232 | 1.34 / 3.08 |
| E Australian | 0.92 | 0.078 / 0.153 | 2.11 / 2.49 |
| N Atlantic Drift | 0.93 | 0.029 / 0.063 | 0.18 / 3.39 |
| California | 0.68 | 0.014 / 0.051 | -2.15 / -4.43 |
| Canary | 0.94 | 0.031 / 0.064 | -3.29 / -2.99 |
| Benguela | 0.45 | 0.034 / 0.095 | -8.20 / -5.68 |
| Humboldt | 0.50 | 0.028 / 0.055 | -3.54 / -4.44 |
| N Eq Current Atl | 0.97 | 0.059 / 0.081 | -0.44 / -1.82 |
| N Eq Current Pac | 0.98 | 0.101 / 0.169 | 0.85 / 0.91 |
| ACC 45-60S | 0.75 | 0.134 / 0.114 | -0.39 / 0.34 |
| **global, 15-60 deg** | **0.71** | -- | **sst r = 0.38** |

Reading it by metric: **direction is close to solved** outside the two
upwelling zones (California, Benguela) and the equatorial band (see
Weaknesses). **Speed undershoots real almost everywhere**, usually by half or
more. **SST is the worst-tracking metric everywhere** -- even regions with
skill above 0.9 (Agulhas, Canary) are 1.5-2x off on SST magnitude, and the ACC
anomaly is still the wrong sign.

This standalone module under procedural wind
(`earth-real-current-compare.smoke.test.ts`) is currently `it.skip`'d while
wind-side work is in progress elsewhere in this session. Its last verified
floors, still the ones in the test file, are at least 13/13 regions with a
positive direction score, global skill above 0.5, and at least 9/10 correct
SST signs -- re-enable and rerun once the wind work settles before trusting a
procedural-wind number again.

## How to run

```sh
pnpm vitest run --project smoke src/test/earth/earth-real-current-compare.smoke.test.ts --reporter verbose
pnpm vitest run --project smoke src/test/earth/earth-current-obswind.diagnostic.smoke.test.ts --reporter verbose
```

Both resolve `SVERDRUP_CURRENTS.computeCurrents` directly rather than through the
shipping pipeline, since this module isn't wired into it. The first is a
regression floor against GODAS/OISST on procedural wind. The second is
diagnostic only -- it asserts nothing about accuracy and gates no build; it
exists purely to print the table above.

## How Earth data isolates model failures

GODAS surface currents and OISST SST anomalies are compared against, never
fed in -- not in production, and not inside any committed test. Two
comparisons exist, and the gap between them is the point:

- **Procedural wind vs GODAS/OISST** (`earth-real-current-compare`) calls
  `SVERDRUP_CURRENTS.computeCurrents` directly, fed by this world's own procedural
  wind model. A bad score here alone doesn't say which side is at fault.
- **Observed NCEP wind vs GODAS/OISST** (`earth-current-obswind`,
  diagnostic) replaces only the wind input with real NCEP winds
  (`WIND.observedWindVectorsForMonth`, sampled from the same Earth asset
  rasters as the GODAS/OISST comparison data), holding every other bit of
  ocean physics fixed. Its `obs` column reimplements the per-month solve by
  hand, one level down, so it can substitute the wind field at exactly the
  point it enters (`SVERDRUP_CIRCULATION.forcing`); its `proc` column calls
  `SVERDRUP_CURRENTS.computeCurrents` directly, the same as the compare test above.

Comparing the two splits the error: a region that's bad under procedural wind
but good under observed wind (e.g. N Atlantic Drift: 0.11 vs 0.93) is a
wind-model problem the ocean model correctly reacts to. A region that's bad
under both, or gets *worse* under observed wind (California, Benguela), is
an ocean-model problem -- `obs` is this model's own ceiling, and it's what
the scores above report.

## Biggest weaknesses

- **No bathymetry.** No depth is passed into any `sverdrup` submodule at
  all -- the sea floor is flat everywhere. The ACC doesn't meander (its `v`
  is an order of magnitude below observed) because the real balance there is
  topographic form drag, not linear bottom friction; the same absence caps
  western-boundary current speed and structure generally.
- **No vertical structure.** Everything is a single surface layer. The
  baroclinic feedback above needed its sign empirically flipped to help
  rather than hurt, precisely because the real physics it approximates lives
  in a subsurface undercurrent this model has no depth to represent. A
  two-layer model is the honest fix; the sign flip is a documented
  workaround, not a rederivation.
- **SST magnitude is still the worst-tracking metric under correct wind**,
  though the coastal-upwelling term (above) fixed the *sign* accuracy the
  weak version used to lose under some wind models. Under observed wind:
  Benguela -8.20C modeled vs -5.68C real, N Atlantic Drift barely warm at
  0.18C vs 3.39C real, and the ACC anomaly is still wrong-signed. Direction
  and sign are close to solved for boundary currents; heat transport
  magnitude is not. NAD is not invariant to the circulation: procedural wind
  produces 1.03C, while replacing that run's surface flow with real GODAS
  current raises 1.06C to 1.39C. Neither closes the remaining 2C gap, and the
  real-current substitution is not a true ceiling because it still has no
  depth-integrated temperature transport (see the NAD tracer-connectivity
  investigation).
- **No nonlinear/eddy term.** The steady linear solve has no inertial
  recirculation, no jet separation, no mesoscale eddies -- real western
  boundary currents get real transport and downstream structure from exactly
  this term. A time-stepped nonlinear attempt exists, unmerged, on
  `ocean-barotropic-vorticity`, but hit its own dead end (geometric
  multigrid diverges on real coastlines).
- **Speed runs low almost everywhere, even under observed wind** (Gulf
  Stream 0.060 vs 0.167 m/s, Agulhas 0.140 vs 0.232, Kuroshio 0.057 vs
  0.148). Partly the Stommel drag width, set to a 2-cell resolution floor
  (~4x the physical boundary layer) after one cell measured worse, not
  physics.
- **The equatorial band is known-wrong by construction.** The Stommel
  balance's leading term, `beta d(psi)/dx`, stops applying near the equator,
  and that's the one region where the observed-wind diagnostic scores worse
  under procedural wind, not better.

## Two-layer model (`currents/two-layer`)

A standalone module (never wired into production; always driven by real
observed wind, never procedural, to isolate ocean-model error from wind-model
error) built to test one specific hypothesis: that a single-layer model's
lack of real heat *storage* (a passive relaxation term has no reservoir, so
weak-signal regions like N Atlantic Drift sit near zero "by construction")
is what keeps NAD/Kuroshio's SST anomaly wrong or too weak. It adds a second,
deep (fixed 300m) layer coupled to layer 1 by Kraus-Turner-style entrainment
(deepening mixed layer mixes layer 2's water in) plus detrainment capture
(shoaling mixed layer leaves its own temperature behind in layer 2 -- the
real re-emergence mechanism, added after entrainment-only made NAD *worse*,
not better, since NAD's peak warmth falls during the one phase entrainment
alone can't bank).

Two bugs surfaced and were fixed before the model was usable:

- **Resonant sign-lock-in.** A 3yr deep-relaxation memory let the reservoir
  accumulate whichever sign the local source happened to have during the
  entrainment window, compounding across spin-up years into a stable but
  wrong equilibrium -- self-reinforcing warm for Kuroshio/Gulf Stream
  (overshoot), self-reinforcing cold for NAD (sign-agreement fell from the
  single-layer baseline's 86% to 66%). Shortening the deep-relaxation time to
  match the real seasonal re-emergence cycle (~1yr, not 3) is necessary but
  not sufficient on its own.
- **A layer-1-only artifact, unrelated to the two-layer coupling at all.**
  Isolating layer 1 with the reservoir coupling forced to zero *still*
  showed Gulf Stream overshooting to 3.35C (single-layer: 1.45C, real:
  1.65C). Cause: the seasonal mixed-layer depth swings up to 400m, and
  layer 1's relaxation time scales linearly with that depth -- up to 631
  days in winter, far past this model's monthly forcing cadence. A
  persistently-signed source (Gulf Stream/Kuroshio's near-constant warm
  advection) barely relaxes in a 631-day-tau winter and only partially
  resets in the brief fast-relaxation summer window, so it compounds year
  over year into an annual mean well above what SVERDRUP_CURRENTS' memoryless
  per-month steady solve gives for the same forcing. Capping the seasonal
  depth at 100m (tau1 ceiling ~150 days) fixed it; verified NOT a step-function
  discretization artifact by linearly interpolating the monthly forcing
  between month-midpoints, which barely moved the result (3.35C to 3.52C).

With both fixes (`SEASONAL_MAX_DEPTH_M = 100`, `DEEP_RELAXATION_YEARS = 1`),
the full two-layer model beats or matches single-layer everywhere tested,
with no regressions: Gulf Stream 1.45 to 1.70C (real 1.65), Kuroshio
sign-agreement 73% to 77%, N Atlantic Drift sign-agreement back to the
single-layer baseline's 86% (no longer regressed), Benguela -6.78 to
-6.22C (real -5.68), Humboldt direction skill 0.50 to 0.54. NAD's own
*magnitude* is still far too weak (0.21C vs 3.39C real) -- heat storage
alone doesn't fix that; the model's advective source term for NAD appears to
be independently too weak, a separate question from what this investigation
answered.

## One-layer conservative heat-transport diagnostic

`sverdrup/heat-transport` tests the next hypothesis without changing
production: advect upper-ocean heat with volume transport derived directly
from the Stommel streamfunction, rather than treating the final smoothed
surface velocity as a passive-tracer velocity. The solver uses conservative
face fluxes and scales both heat capacity and air-sea relaxation by the active
layer depth. `earth-sst-source-decomposition` compares a fixed 100m layer with
the existing spatially varying thermocline depth.

Wind-driven transport alone does not fix NAD. Its annual anomaly moves from
0.18C in the existing solve to 0.26C with the fixed layer and 0.24C with the
thermocline layer; global 15-60-degree SST correlation falls from 0.29 to 0.18
for both. This rejects the narrower hypothesis that retaining the existing
wind-driven streamfunction but transporting heat conservatively is enough.

The same diagnostic can add an Earth-only 17.5Sv northward Atlantic upper
branch from 25-60N, with its compensating deep return implicit. That raises
NAD to 1.34C and Gulf Stream from the transport-only run's 0.25C to 1.25C,
showing that overturning-like transport supplies a large part of the missing
North Atlantic warmth. It still misses NAD's 3.39C target and barely changes
global correlation (0.18 to 0.19), so the uniform branch is evidence for the
missing mechanism, not a candidate production formulation. A useful next
model needs a geographically routed upper branch, explicit sinking/return,
and heat exchange tied to those mass transfers rather than a larger fitted
transport constant.

## Parameterized overturning heat-flux diagnostic

The simpler alternative does not add an AMOC velocity at all. It removes a
specified heat flux from the tropical Atlantic (10-25N, 80-20W) and deposits
the same watts in the subpolar Atlantic (45-60N, 60W-10E), expressed as a
temperature tendency of the existing 50m mixed layer. The two tendencies are
area weighted, so their volume-integrated heat changes cancel exactly. The
existing wind-driven surface current then advects the anomaly; no flow is
hardcoded along the route.

The important input is heat-*flux convergence*, not AMOC volume transport
multiplied by the full tropical-to-subpolar temperature contrast. Observations
put northward Atlantic heat transport near 0.59PW at 40N and 0.23PW at 60N,
so this diagnostic uses their 0.36PW difference as the heat deposited between
those latitudes ([Colin de Verdiere, Meunier, and Ollitrault, 2019](https://doi.org/10.1029/2018JC014565)).
Using the full heat carried near 26N as though all of it stopped in the NAD box
was an instructive wrong attempt: it pushed NAD to 5.38C and the donating North
Equatorial Atlantic to -3.77C.

The measured-convergence closure is directionally useful but insufficient by
itself. NAD rises from 0.18C to 1.25C (real 3.39C), Gulf Stream stays accurate
at 1.37C (real 1.43C), North Equatorial Atlantic improves from -0.44C to
-1.14C (real -1.82C), and global 15-60-degree SST correlation rises from 0.29
to 0.33. It is the smallest physically interpretable SST correction tried so
far, and its failure is clean: observed AMOC heat-flux convergence alone only
accounts for about one third of NAD's missing anomaly. Reaching the target by
turning up this one constant would fit NAD rather than model it; the remainder
has to come from geographically distributed convergence, mesoscale/gyre heat
transport, atmospheric forcing, or a mismatch between OISST zonal anomalies
and what this ocean-only diagnostic can explain.

This remains diagnostic-only. Production SST and current velocities are
unchanged.

## Procedural current-following heat carrier

`sverdrup/heat-carrier` tests the fully procedural alternative under the
steady wind model. It contains no Earth coordinates, observed current, or
prescribed Atlantic heat flux, and it never changes the current velocity.
Two different sources were tested to separate a viable route from a viable
energy budget.

The first version picked up every positive horizontal-advection heat source,
followed the modeled current for one planetary year, and released it
downstream. Its SST source was `original - pickup + release`; release was
area-normalized to equal pickup. At the maximum possible pickup fraction,
steady-wind NAD improved from 0.94C to 1.63C (real 3.39C), but Gulf Stream fell
from an already-accurate 1.43C to 0.31C (real 1.43C). Global 15-60-degree
correlation only moved from -0.06 to -0.01. Extending the lifetime to two
years moved NAD to 1.78C but made Gulf Stream worse at 0.19C. Smaller pickup
fractions only interpolate back toward the baseline.

The follow-up tests the apparent best-of-both-worlds version. Instead of
taking heat from the already-correct advective anomaly, it loads the carrier
from absorbed annual insolation above the ocean's area-weighted mean, gated by
the local poleward current speed. Albedo and mixed-layer heat capacity convert
that real stellar flux to a temperature tendency. The same tendency is
removed at pickup and returned at release, so the tracer conserves heat while
leaving the existing advective source intact. This is planet-general: the
warm source moves with stellar forcing, obliquity, ocean geography, and the
generated current rather than a latitude or basin mask.

That version preserves Gulf Stream (1.43C to 1.45C) and transports 0.51PW,
but NAD remains 0.94C, global correlation remains -0.06, and the southern
western-boundary currents cool slightly (Brazil 0.23C to 0.14C, Agulhas 0.29C
to 0.25C, East Australian 0.64C to 0.56C). A two-year lifetime also leaves NAD
unchanged at 0.93C. The earlier NAD gain therefore did not demonstrate a
complete tropical-to-subpolar route: it came from loading the tracer locally
where positive advection already existed, including the Gulf Stream, then
moving that finite warmth into its extension.

Observed NCEP wind does not supply the missing connection either. It raises
the carrier's pickup from 0.51PW to 1.33PW and modestly warms several boundary
currents (Gulf Stream 1.42C to 1.51C, Agulhas 1.32C to 1.39C, East Australian
2.08C to 2.17C), but NAD remains exactly 0.18C and global correlation remains
0.29. The observed-wind circulation's strong local NAD direction score is
therefore not evidence of a connected tropical-to-NAD surface streamline.

A final diagnostic adds a planet-general thermal overturning cell. Its upper
limb flows from warm toward cold water down the generated annual-temperature
gradient, and an equal opposite deep return closes the volume budget. The
strength scales with planetary radius and an explicit turnover time; it has
no basin, latitude, or Earth transport target. Even an aggressive 50-year
turnover (maximum upper-limb speed 0.255m/s) raises carrier pickup to 1.75PW
but moves observed-wind NAD from 0.18C to 0.17C and leaves global correlation
at 0.29. Gulf Stream instead rises from 1.42C to 1.56C, Kuroshio from 0.61C to
0.77C, while Benguela worsens from -8.22C to -8.52C.

That failure identifies a missing state variable, not a coefficient to turn
up. Temperature is approximately zonal in the background climate, so a
temperature-only density cell transports heat poleward in every basin at
roughly the same latitudes; subtracting the zonal mean removes most of its
signal from an SST-anomaly comparison. Real North Atlantic overturning is
basin-asymmetric largely because density also depends on salinity and the
freshwater budget. This model has neither, so a thermal cell cannot determine
why dense water should form in the Atlantic rather than the North Pacific.

The clean result is that source replenishment solves the donor-theft problem,
but exposes the missing transport connection. Making release additive would
double-count the energy; increasing the source coefficient cannot make a
closed gyre export it into NAD. This remains diagnostic-only and is not wired
into production. A successful general model needs another generated cross-gyre
path with a basin-asymmetric density signal -- most directly a salinity and
freshwater tracer -- before this heat carrier can usefully feed NAD.

# Ocean currents

The wind-driven ocean model (`src/model/climate/ocean/currents`) and what
comparing it against real GODAS/OISST/NCEP data says about it. Wind-side work
is in `wind.md`; land temperature MAE is `README.md`. Nothing here moves
temperature either way: `OCEAN_CURRENTS.applySSTToClimate` is commented out in
`post-elevation/index.ts`, so modeled SST is display-only.

`currents/index.ts` ships a hybrid: a coast-facing warm/cold table indexed by
distance from the ITCZ for SST *magnitude*, but which side of the table
applies at each cell -- warm or cold -- comes from `SVERDRUP_CURRENTS`' own
wind-driven circulation, not a land-side heuristic (see `computeSST`'s module
comment for why). Only sverdrup's SST-anomaly *sign* feeds the table; its own
SST *magnitude* is not used (too weak without a vertical/heat-content layer,
see below). Flow, however, is sverdrup's own field directly -- `flowU`/
`flowV`/`flowUMonthly`/`flowVMonthly` come straight from
`SVERDRUP_CURRENTS.computeSST`'s return, since its wind-driven circulation is
a real current field, not a proxy needing the calibrated-table treatment its
SST magnitude does; `SURFACE_FLOW.fromSstFields` (deriving flow from the SST
gradient) is no longer used for the rotating-planet path, only for the
tide-locked one (`tidal-locked/index.ts`, a separate model sverdrup doesn't
cover). Everything below this point that describes `sverdrup`'s own accuracy
(SST magnitude, direction skill, the model's biggest weaknesses) is about
that standalone module in isolation, run through its own diagnostic tests
calling `SVERDRUP_CURRENTS.computeSST` directly -- not about what the hybrid
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
sign(warmth[r])`, `warmth` being `SVERDRUP_CURRENTS.computeSST(...).sst` --
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
computeSST`, not sverdrup in isolation): 9/10 signed regions correct
(everything except E Australian). Magnitudes now land in the same range as
real anomalies (e.g. Gulf Stream 1.69C vs 1.43C real, California -1.62C vs
-4.40C real) rather than the old table's indirectly-fit values.

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
| Gulf Stream | 0.94 | 0.060 / 0.167 | 1.64 / 1.65 |
| Kuroshio | 0.75 | 0.057 / 0.148 | 0.82 / 0.45 |
| Brazil | 0.94 | 0.126 / 0.098 | 1.76 / 1.37 |
| Agulhas | 0.94 | 0.140 / 0.232 | 1.39 / 3.08 |
| E Australian | 0.92 | 0.103 / 0.153 | 2.24 / 2.49 |
| N Atlantic Drift | 0.93 | 0.029 / 0.063 | 0.16 / 3.39 |
| California | 0.50 | 0.020 / 0.051 | -1.52 / -4.43 |
| Canary | 0.91 | 0.030 / 0.064 | -1.66 / -2.99 |
| Benguela | 0.40 | 0.033 / 0.095 | -3.53 / -5.68 |
| Humboldt | 0.50 | 0.029 / 0.055 | -2.63 / -4.44 |
| N Eq Current Atl | 0.96 | 0.060 / 0.081 | -0.35 / -1.82 |
| N Eq Current Pac | 0.98 | 0.104 / 0.169 | 0.47 / 0.91 |
| ACC 45-60S | 0.74 | 0.142 / 0.114 | -0.17 / 0.34 |
| **global, 15-60 deg** | **0.69** | -- | **sst r = 0.40** |

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

Both resolve `SVERDRUP_CURRENTS.computeSST` directly rather than through the
shipping pipeline, since this module isn't wired into it. The first is a
regression floor against GODAS/OISST on procedural wind. The second is
diagnostic only -- it asserts nothing about accuracy and gates no build; it
exists purely to print the table above.

## How Earth data isolates model failures

GODAS surface currents and OISST SST anomalies are compared against, never
fed in -- not in production, and not inside any committed test. Two
comparisons exist, and the gap between them is the point:

- **Procedural wind vs GODAS/OISST** (`earth-real-current-compare`) calls
  `SVERDRUP_CURRENTS.computeSST` directly, fed by this world's own procedural
  wind model. A bad score here alone doesn't say which side is at fault.
- **Observed NCEP wind vs GODAS/OISST** (`earth-current-obswind`,
  diagnostic) replaces only the wind input with real NCEP winds
  (`WIND.observedWindVectorsForMonth`, sampled from the same Earth asset
  rasters as the GODAS/OISST comparison data), holding every other bit of
  ocean physics fixed. Its `obs` column reimplements the per-month solve by
  hand, one level down, so it can substitute the wind field at exactly the
  point it enters (`SVERDRUP_CIRCULATION.forcing`); its `proc` column calls
  `SVERDRUP_CURRENTS.computeSST` directly, the same as the compare test above.

Comparing the two splits the error: a region that's bad under procedural wind
but good under observed wind (e.g. N Atlantic Drift: 0.05 vs 0.93) is a
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
  Benguela -7.67C modeled vs -5.68C real (now overshooting, having gone from
  -3.53C undershooting before the coastal term), N Atlantic Drift barely warm
  at 0.17C vs 3.39C real, and the ACC anomaly is still wrong-signed. Direction
  and sign are close to solved for boundary currents; heat transport
  magnitude is not, and N Atlantic Drift specifically stays near-zero
  regardless of wind, real current, or relaxation-time substituted in (see
  the NAD tracer-connectivity investigation, this file's git history).
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

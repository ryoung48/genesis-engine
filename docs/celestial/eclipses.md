# Eclipses

Eclipse forecasts are display-only. They neither dim weather nor enter the generated world, climate arrays, history inputs or worker messages. `ECLIPSES` and `ECLIPSE_CALENDAR` own celestial geometry and the rate-bounded scan; `WEATHER_ECLIPSES` supplies the climate clock, immutable parameter snapshots and caches.

## Frame

Moon inclination and ascending-node longitude are relative to the planet's orbital plane. The ecliptic x-axis points toward the vernal equinox, matching `WEATHER_CLOCK.ecliptic().solarLongitudeRad`. Longitude of perihelion is ϖ, so Kepler's argument of periapsis is ω = ϖ − Ω. Kepler time is physical seconds divided by 86400, independent of the world's rotation period.

`WEATHER_SKY.bodyFixed` first rotates about x by the clock's effective tilt, then aligns the equatorial star longitude with the clock sun. A final rigid rotation aligns declination as well. This preserves vector lengths and angles, reproduces `WeatherInstant.sun`, and accommodates monthly averaged locked-world declination without changing the clock's illumination. At a solar pole, the preceding longitude defines east.

Moon rows derive phase and illumination from the three-dimensional Kepler position. Transit uses equatorial/body-fixed longitude; retrograde moon mean motion has the opposite sign. Rise/set still uses instantaneous declination and mean transit, rather than solving contacts with a moving horizon.

## Geometry

Local solar geometry subtracts the surface observer from both finite centre vectors, including stellar parallax. Apparent semidiameters are `asin(radius / distance)`; only foreground moons occult the star. Partial, annular and total classifications use angular disk intersection. Coverage uses a planar two-circle lens on angular radii, with explicit disjoint, containment and concentric cases. It approximates angular disks rather than exact spherical solid angles.

Planet-wide solar geometry intersects the whole planet sphere with closed tangent shadow cones. The external and internal tangent sines are `(Rstar − Roccluder) / L` and `(Rstar + Roccluder) / L`. A meridian disk and signed distance to the truncated cone wedge handle side, vertex and tangent-plane contacts. Umbral intersection takes precedence over antumbral intersection, including hybrid events. Classification never substitutes the sub-moon point for the planet sphere.

Lunar geometry uses the planet as occluder: penumbral intersection, umbral intersection and whole-moon umbral containment give penumbral, partial and total lunar eclipses. There is no umbra beyond its vertex. Equality alone is not a positive-duration eclipse. Overlapping bodies and invalid radii are unavailable.

See [NASA's fundamental-plane description](https://eclipse.gsfc.nasa.gov/SEcat5/beselm.html) for the finite shadow geometry.

## Calendar

The calendar scans each moon's signed penumbral margin `f(t)` (metres, `ECLIPSE_SHADOW.evaluate(...).penumbra`) separately for solar and lunar events with `SCAN`.

**Stepping.** From `t`, it steps to `t + max(1 s, |f(t)| / L)`, where `L` bounds `|f′|`. `f` cannot change sign inside `|f(t)| / L` of `t`, so a sign change can only fall inside a 1-second step. That step is the contact bracket and is reported at its midpoint. Any eclipse lasting longer than one second is therefore found. Far from alignment `|f|` is large and steps are long. Near a contact or a near miss, steps shrink geometrically.

**Rate bound.** The margin's rate bound is `L = 1.25 × (v_peri + (r_apo + R_planet) × σ_star)`:
- `v_peri = n·a·sqrt((1+e)/(1−e))` is the moon's Kepler periapsis speed.
- `r_apo = a(1+e)` is the moon's apoapsis distance.
- `σ_star = max|dS/dt| / min|S|` comes from the clock's daily star table (`WEATHER_CLOCK.rates`).

A shadow-cone point near the planet lies just beyond the occluder's tangent point. It moves at about `V_occluder + λ·V_star` with `λ = |X − P_o| / |P_o − P_s| ≪ 1`. For lunar events the target moon itself moves at no more than `v_peri`. The 1.25 factor covers the dropped `λ` and tangent-point terms, which are below 1% for prepared moons (about 0.3% for Luna). The guarantee rests on these analytic bounds and unperturbed Kepler motion, not on certified arithmetic. [NAIF's geometry-finder guidance](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/gf.html) explains why a fixed step size alone cannot establish completeness.

**Maximum and kind.** Greatest eclipse is the golden-section maximum of the margin between ingress and egress, to 1 s. A constant objective returns its left edge. The kind comes from the shadow state at that instant, and total takes precedence for hybrid events. A two-peaked objective may report a local maximum.

**Caching.** `WEATHER_ECLIPSES` keeps one resumable scan per moon and kind for each captured parameter set. It starts one clock year before the first queried year, so events in progress at a query's start keep their true ingress. Queries extend the scans synchronously. An event still open at the window end is followed for one more clock year; if it is still open, it is returned clipped (persistent alignment). `WEATHER_ECLIPSES.next` extends one year at a time and stops at the first year with an event. Results are `complete` or `unavailable` (invalid or overlapping geometry). There are no loading or unresolved states.

| Parameter | Value | Reason |
| --- | --- | --- |
| Contact / maximum resolution | 1 physical second | Display-scale timing; only positive runs shorter than this can be skipped. |
| Rate safety | 1.25 | Covers rate terms dropped from the bounds, each below 1% for prepared moons. |
| Forecast horizon | 20 clock years | Bounded forecast shared by every moon, including disparate periods. |
| Lead-in / open-event follow-up | 1 clock year each | True ingress for events in progress; closes events that cross the horizon. |

Earth/Luna: one clock year takes about 2,000 margin evaluations (about 35 ms cold), and 20 years about 21,000 (about 95 ms cold). Repeated queries are below 0.1 ms. A 1-day, e = 0.95 extra moon raises a year to about 100,000 evaluations (about 0.3 s).

## Local circumstances

A local eclipse needs a global one, so a site scans only inside each global event's `[ingress, egress]`.
- **Solar:** scans the local angular margin `a + b − separation` from finite observer vectors. Its bound combines topocentric moon and star angular rates with semidiameter rates.
- **Horizon:** scans altitude above the sky's solar −0.833° or lunar +0.125° centre convention. Its bound is the body-fixed frame's spin (`WEATHER_CLOCK.rates().frameRadS`: rotation plus 3σ_star plus libration and locked declination slopes) plus the body's own angular rate.
- **Visibility:** overlap ∩ above-horizon for solar, and the global interval ∩ moon above the horizon for lunar. A geometric maximum below the horizon does not remove an eclipse visible at sunrise or sunset.

Visible duration sums the observable intervals.
- **Solar maximum:** the golden-section coverage maximum over the visible intervals. On a totality or annularity plateau, bisection picks the earliest time at the plateau value.
- **Lunar maximum:** the global maximum when visible. Otherwise it is the visible endpoint with the most umbral (or penumbral) penetration.

Circumstances are cached per site and event, so moving the clock costs well under a millisecond. Current events carry instantaneous solar coverage, and multiple moons can appear simultaneously.

The Sun & moon card shows current eclipses, then the next event, with visible maximum, duration and coverage. With no event it shows "None in the next 20 years", and invalid geometry shows "Unavailable" (per moon or pair where possible). Locked worlds show a simulation date and "No day cycle" instead of inventing a clock time. The planet stat uses year/day and kind from `WEATHER_ECLIPSES.next`, not daily tidal samples.

## Precession

Displayed moon positions (sky rows, display tides, eclipses) precess. Generated tidal forces in `tidal-schedule` do not, so climate arrays and history inputs are unchanged.

**Rates.** `MOON_PRECESSION.rates` gives secular rates of Ω and ϖ in the ecliptic frame, with `m = P_moon/P_year`.
- **Solar term:** Brown's lunar-theory series, `Ω̇ = n·cos i·(−¾m² + 9/32·m³ + 273/128·m⁴)` and `ϖ̇ = n·cos i·(¾m² + 225/32·m³ + 4071/128·m⁴)` (Brouwer & Clemence 1961). Above m = 0.1 only the m² terms are used.
- **Oblateness term:** `Ω̇ = −(3/2)·n·J2·(R/p)²·cos i_eq`, and `ϖ̇` adds `(3/4)·n·J2·(R/p)²·(5cos²i_eq − 1)`.
  - `J2 = 0.94·q/3`, using Earth's fluid Love number, with `q = ω²R³/GM`. This gives Earth 1.08×10⁻³.
  - `i_eq` is measured against the spin axis tilted by the clock's obliquity. The full Laplace-plane geometry is not modelled.

For Earth's Luna this gives a node at −19.3°/yr (observed −19.35°/yr) and apsides at +39.1°/yr (observed +40.7°/yr).

**Elements at time t** (`MOON_PRECESSION.elements`):
- `Ω = Ω₀ + Ω̇t` and `ϖ = ϖ₀ + ϖ̇t`.
- `M₀` is reduced by `ϖ̇t`, so the mean longitude still advances at the sidereal rate. Periods and phases are unchanged.
- The draconic month becomes `2π/(n − Ω̇)` and the anomalistic month `2π/(n − ϖ̇)`.
- Eclipse seasons therefore recur every eclipse year, about 346.6 days on Earth, and Saros-like repeats follow from these periods.

## Multiple moons

**Availability.**
- Each moon is validated on its own. Invalid elements, or a periapsis inside `R_planet + R_moon`, drop only that moon.
- Moons that `TIDAL_CONTRIBUTORS.prepare` cannot place are reported the same way.
- A pair whose radial ranges come within `R_A + R_B` (`peri_outer − apo_inner`) is skipped as a pair.
- The card lists the affected moons or pairs in one "Unavailable for …" row; every other forecast stays.
- The whole forecast is unavailable only for star or planet failures.

**Moon shadows** (`shadow-penumbral | shadow-partial | shadow-total`).
- Every ordered valid pair has a track for B's penumbral cone reaching A, using `ECLIPSE_SHADOW` with B as occluder and A as target.
- Rate bound: `1.25 × (v_peri,A + v_peri,B + (r_apo,A + r_apo,B + R_planet)·σ_star)`.
- Like a lunar eclipse, the event is the same everywhere. It is visible wherever the shadowed moon is above the lunar horizon.

**Occultations** (`occultation-partial | occultation-annular | occultation-total`).
- Each unordered valid pair has a track on a geocentric angular margin that is a strict superset of local visibility: `asin(R_A/(d_A − R_p)) + asin(R_B/(d_B − R_p)) + asin(R_p/d_A) + asin(R_p/d_B) − θ_AB`. A surface observer shifts each direction by at most `asin(R_p/d)` and sees each semidiameter at most `asin(R/(d − R_p))`.
- Its rate bound sums `v_peri/(r_peri − R_p) × (1 + tan s + tan p)` for both moons.
- Locally, the nearer moon occults the farther one's disk. That disk is classified like the star in a solar eclipse, and visibility needs the occulted moon above the horizon.
- Because the planet-wide track is a superset, a grazing event can be listed that no province sees; the planet stat may name one.

**Combined coverage.**
- When two or more solar eclipses overlap at a site, `ECLIPSE_DISKS.union` integrates the star disk on an equal-area polar grid (128 rings × 256 sectors), using the moons' angular offsets on the plane tangent to the star direction. The error is about 1–3%, and slivers under one cell can round to total.
- A single overlapping disk keeps the exact lens value.
- The card adds a "Combined solar eclipse · A + B" row with combined coverage, whether the combination is total, and the time of the combined maximum (golden-section on the union over the overlapping visible windows).

**Distance-aware bounds.** Rate bounds come from bins in eccentric anomaly rather than the periapsis speed.
- Moons with e ≥ 0.2 use 16 bins, which are short in time near periapsis. Each bin stores `r_min`, `r_max` and the vis-viva speed at `r_min`, plus `r_max·(|Ω̇| + 2|ϖ̇|)` for the turning orbit.
- `SCAN.advance` takes a bound that is valid until the next bin edge, and never steps past that edge, so the detection guarantee is unchanged.
- Near-circular moons use one bin and pay nothing extra.
- Geocentric angular rates use `v/r`; only semidiameters use `r − R_planet`.

**Cost.** Pairs add tracks quadratically in the number of moons.
- Earth/Luna costs 1,845 evaluations, or about 30 ms cold, per clock year.
- Earth plus a 1-day, e = 0.95 moon with about 357 events a year costs 161,000 evaluations, or about 0.4 s cold. That was 537,000 and 0.87 s with periapsis-speed bounds.
- "Next" stops at the first year with an event, and warm queries are below 1 ms.

## Isolation and limitations

Default Luna's Ω = ϖ = 0 leaves every generated tidal-force sample and generated array unchanged by the periapsis correction. Nonzero-node moons intentionally receive corrected generated forces. Display tides change because their sky positions now follow inclined, eccentric orbits; their amplitudes remain evaluated at mean orbital distance.

Bodies are spherical, with no aberration, atmospheric umbral enlargement or limb profile. Precession is secular and first-order in time, with no Laplace-plane geometry, and generated tidal forces keep fixed elements. Hybrid events use the total class. Parent giants are absent as sky bodies, and cannot eclipse their moons; sibling moons retain the same approximation as tides. Mutual perturbations between moons, eclipse-driven weather changes, and eclipse-path maps are excluded. Detection relies on the analytic rate bounds above rather than certified arithmetic, and a two-peaked objective may report a local maximum.

Local diagnostic artifacts are saved under ignored `stats/eclipses/`, including regenerated isolation fingerprints and scan timings (`scan-latency.json`).

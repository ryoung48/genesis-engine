# Province local weather

Local weather is a deterministic, display-only realization of generated monthly climate. It does not change climate arrays, water balance or history. The province wiki is its interactive surface; no Conditions map, legend or hover mode is provided. See [province navigation](../development/province-wiki.md).

## Sky and eclipses

Moon rows follow prepared inclined, eccentric Kepler orbits in the clock's shared frame, with nodes and apsides precessing so eclipse seasons drift through the year. The Sun & moon section includes current eclipses and the next confirmed locally visible eclipse, with local maximum, observable duration and solar coverage. Forecasts are computed synchronously and cached per world and site, show "None in the next 20 years" or "Unavailable" when there is nothing to list, and never change weather values. See [eclipse geometry, frame and numerical limits](../celestial/eclipses.md).

## One generator

`inputs` samples numeric climate and actual local solar context. `decision` contains the original model's regime → cloud → phenomenon tree and the agreed numeric constraints. `region` turns that one decision into numeric precipitation, a primary phenomenon and a cloud description. `clouds` only represents the selected category as numeric estimated occurrences; it does not independently classify weather. `vocabulary` contains the 36 primary phenomena and eight cloud/sky descriptions.

The competing condition classifier, inferred atmospheric-layer/instability regimes, particle-loading classifier, surface-inventory model and subsequent label translator have been removed. Hail, freezing rain and rain and snow come from the same decision tree as every other phenomenon, not from a parallel generator. Light snow means falling snow, not retained ground snow.

The source decision tree is `world-generator/src/models/cells/weather/index.ts` in the sibling project. The exact cloud table and constraint changes are documented in [condition rules](local-weather-conditions.md). Cloud names are procedural descriptions, not diagnosed altitude or stability measurements.

## Climate inputs and time

The compact province index keys immutable climate baselines. Each province uses its seed location and up to two farthest member regions, with nearest-sample mesh-area weights. This three-location coverage/cost choice and the explicitly approximate nearest-land fallback are unchanged. Airless worlds and invalid numeric baselines return unavailable weather.

Monthly temperature, DTR, wind components, dew point and cloud fraction interpolate cyclically between month centers. Monthly rainfall totals define a periodic cumulative cubic Hermite curve; positive harmonic endpoint slopes, or zero at dry secants, make its derivative integrate to each month's total. The derivative supplies the expected precipitation rate. Cloud fraction supplies an expected coverage constraint, separately from the categorical cloud table. Dew point reuses the existing surface humidity estimate; it is not column humidity.

The simulation date converts to physical orbital seconds. Manual dates and local solar time use the shared orbital/rotation clock. Actual illumination, eccentricity, hemisphere, retrograde rotation, polar conditions and locked worlds are retained. Annual climate has no instantaneous weather until a date is selected. Weather uses generated climate, independently of Observed/Diff map controls.

Temperature adds half the available DTR as a cosine peaking at local solar phase 0.625 and a Gaussian anomaly with standard deviation `min(6, 1 + 0.12 × annual range)` °C, where the annual range spans the twelve monthly means. This approximates day-to-day station variability: about 1°C in the tropics, 3°C for a 13°C maritime range and 4–5°C for continental interiors. Dew point adds a 1.5°C independent moisture anomaly and is capped at air temperature.

Wind components use the monthly vectors, a ±15% daily modulation with the same phase, and zero-mean Gaussian anomalies with standard deviation `2 + sin²(2φ) + 3 × min(2, max(0, −z − 0.5)) + 1 × min(2, max(0, z − 0.5))` m/s. Here φ is latitude and z the weather-branch field, whose low tail selects the stormy regime. The sin²(2φ) term adds 1 m/s of synoptic variability peaking in the 45° storm tracks, where eddy kinetic energy is greatest. The stormy side widens the spread by up to 6 m/s, the clear post-frontal side by up to 2 m/s. Cyclone winds peak around the low itself, and the old symmetric widening made clear-sky hours windier than thunderstorms (5.3 vs 4.4 m/s mean in the v5 bench).

Speeds above 25 m/s are softly compressed, `25 + e/(1 + e/8)` for excess e, approaching 33 m/s, so mid-latitude storms reach storm force. Tropical-cyclone winds bypass the compression (see [condition rules](local-weather-conditions.md#tropical-cyclones)). Gust excess is `max(1.5 m/s, 0.5 × speed) × (0.6 + 0.8 × normalCDF(gustField))`, a mean gust factor near 1.5, the open-terrain value in WMO gust-conversion guidance. Thunderstorm outflow raises gusts further (see [condition rules](local-weather-conditions.md#severe-weather-modulation)).

Front passages follow the branch field's three-hour change, `Δz = z(t) − z(t − 3 h)`, scaled by the storm-track weight `sin²(2φ)` because fronts are a mid-latitude feature:

- Temperature changes by `−10 × sin²(2φ) × Δz` °C. Clearing (rising z) cools behind a cold front and an approaching system warms ahead of it. Typical 3-hour Δz of about 0.13 gives ±1.3°C, and strong systems give 3–4°C.
- Wind gains `k × (V, −U)`, the monthly vector turned 90°, with `k = sign(φ) × 4 × sin²(2φ) × Δz`. This veers the wind (clockwise) as a front passes in the northern hemisphere and backs it in the southern, about 25–30° for a typical Δz.
- Both terms are linear in the zero-mean Δz, so monthly means are kept.

The pressure tendency is `12 × (0.25 + 0.75 sin²(2φ)) × Δz` hPa per 3 hours: falling ahead of a system and rising behind it. That is about 1.6 hPa for a typical mid-latitude Δz and a quarter of that in the tropics, where synoptic tendencies are small. The wiki labels it steady below 0.7 hPa (0.02 inHg), and rising or falling rapidly at ≥2 hPa, near the NWS "rapidly" threshold of 0.06 inHg per 3 hours. It is a narrative cue derived from the branch field, not a solved pressure field.

Actual daylight and phase identify the night, when clear-sky radiative fog and deposits form. Cooling toward night/dawn raises relative saturation through the shared temperature/dew-point calculation. Night-time clear-sky surface cooling is `min(3°C, DTR × 0.25)/(1+wind/2)`; other regimes scale it by `1 − monthlyCloudMean`, and missing DTR disables it. Locked worlds disable the daily temperature/wind oscillation and use actual illumination rather than invented clock hours.

## Correlated draws

Seeded Gaussian lattice fields use a 3D Cartesian spatial lattice per time node, so they are smooth across the longitude seam. Each time node's pattern drifts, measured from that node's time, with a steering wind of twice the local monthly surface wind vector; blending adjacent nodes makes systems travel instead of pulsing in place. The factor two approximates the ratio of lower-tropospheric steering flow to 10 m wind. Smoothstep weights are variance-normalized; Box–Muller uniforms floor at 2^-32. Each lattice corner hashes the seeded channel string once and then mixes its integer coordinates and time node with multiply–xorshift steps; this avoids short integer-time repetition and costs about 1.4 µs per field draw, against 13 µs for the earlier per-corner string keys.

The single regime (branch) draw, temperature, moisture and wind draws use 600 km/48 physical-hour lattice scales. The cyclone draw also uses 600 km/48 hours, the size and passage time of a tropical storm, and the cloud-layer draw uses it so cloud decks persist regionally. Event and precipitation draws use 150 km/6 hours, allowing showers inside longer weather situations; gusts use 60 km/600 seconds. These are correlation heuristics, not measured storm dimensions. Channels are separate draws except that the branch field also sets wind spread, front passages and the pressure tendency. Neighboring locations are correlated, not forced to have identical weather.

## Province aggregation and execution

Temperature, precipitation, wind vectors and total cloud fraction use area-weighted samples. Phase fractions are weighted by water flux; dry provinces have zero liquid/snow/ice fractions. Gusts use the maximum sample, and visibility uses the minimum sample.

Each location has one primary phenomenon. For a province with precipitation, the representative location is the one with greatest area-weighted precipitation flux; otherwise its phenomenon has the greatest area share. Its regime and cloud description travel together, except that a clear or hazy representative in a province with positive mean cover takes the cloud description of the sample contributing the most cover. Per-phenomenon area shares and numeric genus cover remain available internally. Missing positive-weight cloud data makes the province cloud summary unavailable. No debug variation section is displayed.

Ocean-facing provinces carry one extra sample at a sea cell, used only for waves and never blended into the province values; see [marine conditions](marine-conditions.md).

A separate module worker receives immutable baselines, using initialization batches of 256 with task yields. Snapshot LRU capacity is 256. Exact-time keys, world revisions and request IDs prevent stale results. The UI retains one active request and one coalesced replacement. There is no weather map protocol or full-world instantaneous cache.

## Diagnostic

Run `pnpm exec vitest run --project smoke src/test/earth/local-weather-report.diagnostic.smoke.test.ts`. The [weather bench](../development/weather-bench.md) reads saved reports at `/weather/bench`.

The default world is procedural: seed 14963991 with the default generation parameters and `WEATHER_POINTS` points (default 204000), generated once through the shared history world cache. Cyclone and tornado risk exist only on procedural worlds. `WEATHER_WORLD=earth` selects the Earth heightmap import instead; its reports record `configuration.world`, so the bench does not pair them with procedural ones.

The fixed workload is seed 14963991, 204000 requested points/204001 mesh regions, 64 stratified land locations, year-zero epoch, ten synthetic years and seven-hour sampling; seven is coprime with 24, so every site cycles through all local hours. Climate × elevation (<1/≥1 km) × coast-distance (<100/≥100 km) strata use deterministic hash selection. Results remain local under `stats/weather/<start-UTC>-province-local-weather/`.

The completed pre-replacement baseline is `stats/weather/2026-11-03T01-36-00-565Z-province-local-weather/results.json`. Compare numeric rainfall, temperature, wind and cloud departures separately from changed narrative frequencies, timing and memory. The current model tag is `original-tree-constrained-v6`. v6 adds storm-side wind, a raised wind cap, outflow gusts, tropical cyclones, fronts and pressure tendency, the dew-point thunderstorm gate, tornadoes, warm-nose freezing rain, freezing-level hail, thundersnow, showers, stratus drizzle, freezing fog/drizzle, ice crystals, drifting snow, blowing sand/dust, heavy snow showers, few clouds in the clear regime, stratocumulus, stratus for advective fog, freezing fog limited to −10–0°C and freezing rain limited to layered cloud. It renames sleet to rain and snow and diamond dust to ice crystals, and turns haze from a cloud category into a dryness-driven condition. v6 reports default to the procedural world. Each sample's environment is also recorded under `regime:<base regime>` before the windy relabel. v5 is the earlier 22-phenomenon Earth model. v4 is v3 plus storm-track wind variability, windy wet-regime lulls and ground blizzards. v3 introduced the storminess axis, cloud-matched dry split, temperature-dependent storm share and windy/fog overlays; v2 used the original two-draw branch/regime weights, and v1 reports used six-hour sampling with fixed per-site local hours. Previously saved reports are preserved; their simultaneous physical-condition frequencies are not equivalent to the new exclusive primary-phenomenon frequencies.

Reports include wet-hour rate and cloud-cover histograms, temperature-departure SD, mean gust factor, per-site bare-ground dust/sand shares, eligible-site blizzard (snow-season sites) and sand/dust (arid bare sites) rates, primary phenomena, regime occupancy, dry/precipitating regime intervals, conditional cloud distributions, temporal runs, local-time/season/climate breakdowns, nearest-site agreement, water partitions, blizzard consistency, reproducibility and baseline immutability. The bench's cloud matrix exposes the actual phenomenon/cloud pairings.

These are unweighted stratified-site occupancies, not global area frequencies. Seven-hour sampling misses brief weather and quantizes runs; sparse global sites do not resolve local storm geometry. Expected rainfall and cloud constraints hold over the procedural draws, not exactly in every sampled month. The temperature kernel is retained up to floating-point evaluation order. Vector wind retains the monthly baseline; widened system anomalies set the wind-speed tail. Precipitation occurrences, cloud categories and phenomenon frequencies intentionally change. No arbitrary frequency pass/fail bands or observational calibration are claimed.

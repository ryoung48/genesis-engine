# Province local weather

Local weather is a deterministic, display-only realization of generated monthly climate. It does not change climate arrays, water balance or history. The province wiki is its interactive surface; no Conditions map, legend or hover mode is provided. See [province navigation](../development/province-wiki.md).

## One generator

`inputs` samples numeric climate and actual local solar context. `decision` contains the original model's regime → cloud → phenomenon tree and the agreed numeric constraints. `region` turns that one decision into numeric precipitation, a primary phenomenon and a cloud description. `clouds` only represents the selected category as numeric estimated occurrences; it does not independently classify weather. `vocabulary` contains exactly the requested 26 phenomena and eight cloud/sky descriptions.

The competing condition classifier, inferred atmospheric-layer/instability regimes, particle-loading classifier, surface-inventory model and subsequent label translator have been removed. There is no parallel hail/freezing-rain/ice-pellet generator. Dusting means the original falling-snow phenomenon, not retained ground snow.

The source decision tree is `world-generator/src/models/cells/weather/index.ts` in the sibling project. The exact cloud table and constraint changes are documented in [condition rules](local-weather-conditions.md). Cloud names are procedural descriptions, not diagnosed altitude or stability measurements.

## Climate inputs and time

The compact province index keys immutable climate baselines. Each province uses its seed location and up to two farthest member regions, with nearest-sample mesh-area weights. This three-location coverage/cost choice and the explicitly approximate nearest-land fallback are unchanged. Airless worlds and invalid numeric baselines return unavailable weather.

Monthly temperature, DTR, wind components, dew point and cloud fraction interpolate cyclically between month centers. Monthly rainfall totals define a periodic cumulative cubic Hermite curve; positive harmonic endpoint slopes, or zero at dry secants, make its derivative integrate to each month's total. The derivative supplies the expected precipitation rate. Cloud fraction supplies an expected coverage constraint, separately from the categorical cloud table. Dew point reuses the existing surface humidity estimate; it is not column humidity.

The simulation date converts to physical orbital seconds. Manual dates and local solar time use the shared orbital/rotation clock. Actual illumination, eccentricity, hemisphere, retrograde rotation, polar conditions and locked worlds are retained. Annual climate has no instantaneous weather until a date is selected. Weather uses generated climate, independently of Observed/Diff map controls.

Temperature adds half the available DTR as a cosine peaking at local solar phase 0.625 and a Gaussian anomaly with standard deviation `min(6, 1 + 0.12 × annual range)` °C, where the annual range spans the twelve monthly means. This approximates day-to-day station variability: about 1°C in the tropics, 3°C for a 13°C maritime range and 4–5°C for continental interiors. Dew point adds a 1.5°C independent moisture anomaly and is capped at air temperature.

Wind components use the monthly vectors, a ±15% daily modulation with the same phase, and zero-mean Gaussian anomalies with standard deviation `2 + sin²(2φ) + 2 × min(2, max(0, |z| − 0.5))` m/s, where φ is latitude and z the weather-branch field. The sin²(2φ) term adds 1 m/s of synoptic variability peaking in the 45° storm tracks, where eddy kinetic energy is greatest. Both tails of z widen the spread by up to 4 m/s more: low z is the wet side of a system, high z the dry post-frontal side, and strong pressure gradients occur on both. Gust excess is `max(1.5 m/s, 0.5 × speed) × (0.6 + 0.8 × normalCDF(gustField))`, a mean gust factor near 1.5, the open-terrain value in WMO gust-conversion guidance.

Actual daylight and phase identify afternoon, when the original tree excludes its fog regime. Cooling toward night/dawn raises relative saturation through the shared temperature/dew-point calculation. Night-time clear-sky surface cooling is `min(3°C, DTR × 0.25)/(1+wind/2)`; other regimes scale it by `1 − monthlyCloudMean`, and missing DTR disables it. Locked worlds disable the daily temperature/wind oscillation and use actual illumination rather than invented clock hours.

## Correlated draws

Seeded Gaussian lattice fields use a 3D Cartesian spatial lattice per time node, so they are smooth across the longitude seam. Each time node's pattern drifts, measured from that node's time, with a steering wind of twice the local monthly surface wind vector; blending adjacent nodes makes systems travel instead of pulsing in place. The factor two approximates the ratio of lower-tropospheric steering flow to 10 m wind. Smoothstep weights are variance-normalized; Box–Muller uniforms floor at 2^-32. Channel plus full lattice-coordinate strings avoid short integer-time repetition.

The single regime (branch) draw, temperature, moisture and wind draws use 600 km/48 physical-hour lattice scales. Event and precipitation draws use 150 km/6 hours, allowing showers inside longer weather situations; gusts use 60 km/600 seconds. These are correlation heuristics, not measured storm dimensions. Channels are separate draws except that the branch field also sets wind spread. Neighboring locations are correlated, not forced to have identical weather.

## Province aggregation and execution

Temperature, precipitation, wind vectors and total cloud fraction use area-weighted samples. Phase fractions are weighted by water flux; dry provinces have zero liquid/snow/ice fractions. Gusts use the maximum sample, and visibility uses the minimum sample.

Each location has one primary phenomenon. For a province with precipitation, the representative location is the one with greatest area-weighted precipitation flux; otherwise its phenomenon has the greatest area share. Its regime and cloud description travel together. Per-phenomenon area shares and numeric genus cover remain available internally. Missing positive-weight cloud data makes the province cloud summary unavailable. No debug variation section is displayed.

A separate module worker receives immutable baselines, using initialization batches of 256 with task yields. Snapshot LRU capacity is 256. Exact-time keys, world revisions and request IDs prevent stale results. The UI retains one active request and one coalesced replacement. There is no weather map protocol or full-world instantaneous cache.

## Diagnostic

Run `pnpm exec vitest run --project smoke src/test/earth/local-weather-report.diagnostic.smoke.test.ts`. The [weather bench](../development/weather-bench.md) reads saved reports at `/weather/bench`.

The fixed workload is seed 14963991, 204000 requested points/204001 mesh regions, 64 stratified land locations, year-zero epoch, ten synthetic years and seven-hour sampling; seven is coprime with 24, so every site cycles through all local hours. Climate × elevation (<1/≥1 km) × coast-distance (<100/≥100 km) strata use deterministic hash selection. Results remain local under `stats/weather/<start-UTC>-province-local-weather/`.

The completed pre-replacement baseline is `stats/weather/2026-11-03T01-36-00-565Z-province-local-weather/results.json`. Compare numeric rainfall, temperature, wind and cloud departures separately from changed narrative frequencies, timing and memory. The current model tag is `original-tree-constrained-v4` (v3 plus storm-track wind variability, windy wet-regime lulls and ground blizzards); v3 introduced the storminess axis, cloud-matched dry split, temperature-dependent storm share and windy/fog overlays; v2 used the original two-draw branch/regime weights, and v1 reports used six-hour sampling with fixed per-site local hours. Previously saved reports are preserved; their simultaneous physical-condition frequencies are not equivalent to the new exclusive primary-phenomenon frequencies.

Reports include wet-hour rate and cloud-cover histograms, temperature-departure SD, mean gust factor, per-site bare-ground dust/sand shares, eligible-site blizzard (snow-season sites) and sand/dust (arid bare sites) rates, primary phenomena, regime occupancy, dry/precipitating regime intervals, conditional cloud distributions, temporal runs, local-time/season/climate breakdowns, nearest-site agreement, water partitions, blizzard consistency, reproducibility and baseline immutability. The bench's cloud matrix exposes the actual phenomenon/cloud pairings.

These are unweighted stratified-site occupancies, not global area frequencies. Seven-hour sampling misses brief weather and quantizes runs; sparse global sites do not resolve local storm geometry. Expected rainfall and cloud constraints hold over the procedural draws, not exactly in every sampled month. The temperature kernel is retained up to floating-point evaluation order. Vector wind retains the monthly baseline; widened system anomalies set the wind-speed tail. Precipitation occurrences, cloud categories and phenomenon frequencies intentionally change. No arbitrary frequency pass/fail bands or observational calibration are claimed.

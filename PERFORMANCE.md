# Performance

## Goal

Reduce `pnpm gen:world` runtime while preserving the exact generated outputs.

## Big-bet evaluation mode

For the next exploration phase, some experiments are allowed to change the fingerprint if the speedup is large enough and the impact is understood.

When evaluating a big bet, record:

- before / after timing for the targeted stage and `orogen:total`
- whether the fingerprint changed
- whether the river/lake summary changed
- whether land-only vegetation / climate / topography distributions changed, and roughly how
- whether the tradeoff looks worth keeping

Default rule for big bets:

- keep only changes that produce a clear, meaningful speedup
- reject changes that drift outputs without enough payoff
- prefer isolated changes whose impact can be described cleanly

## Hard constraints

- Preserve smoke fingerprint: `0a9f9d54bbd70c4965b09ed880ef3b52b7657cc9063ba8e911423e48ff88e06b`
- Preserve the current river/lake summary assertions
- Preserve the current land-only vegetation / climate / topography distributions
- Do not accept speed wins that rely on output drift unless the drift is understood and explicitly accepted

## Current instrumentation

- `world.timings` includes both top-level pipeline timings and all `Post:` timings
- The generation panel timing UI shows:
  - a top-level pipeline chart
  - a dedicated **Post breakdown** chart

Latest observed smoke sample from this session:

- `orogen:total`: about `9.844s`
- `Post: rainfall`: about `891.7ms`
- `Post: rivers`: about `609.6ms`
- `Post: topography`: about `198.5ms`

## Landed wins to keep

- `src/model/climate/pasta.ts`
  - reuse `climate.insolation_monthly` instead of recomputing insolation
  - reuse classification-computed debug metrics instead of recomputing them in `assignPastaClimate()`
  - isolated A/B kept the exact smoke fingerprint and improved `Post: pasta climate` from about `615.7ms` to about `406.3ms`
- `src/model/climate/rain.ts`
  - reuse cached land-neighbor data for rainfall smoothing
  - reuse cached default-bin TEQ region bins for the default 120-bin thermal-equator path
- `src/model/climate/climate.ts`
  - reuse cached mesh-derived latitude / band geometry in `computeLandFraction()` and `computeMonthlyDaylightHours()`
  - exact-preserving win; validation runs improved `Post: climate` from about `331.9ms` to about `240.8ms` / `310.9ms`
- `src/model/terrain/classification.ts`
  - replace `Array.from(smoothedSlope).sort(...)` with `smoothedSlope.slice().sort()` in `computeSlopeScore()`
  - exact-preserving win; latest kept validation reported `Post: topography` dropping to about `107.8ms`
- `src/model/terrain/rivers.ts`
  - replace river-start filter chaining with manual collection and reuse a single scratch `lineCells` buffer during polyline tracing
  - exact-preserving win; kept smoke validations reported `Post: rivers` improving from about `690.7ms` to about `589.3ms` / `599.9ms`
- `src/model/pipelines/generate-world.ts`
  - clamp hotspot contributions in place instead of allocating a second `Float32Array`
  - exact-preserving win; kept smoke validations reported `orogen:hotspots` improving from about `394.7ms` to about `363.2ms` / `351.0ms`
- `src/model/climate/rain.ts`
  - run rain-band warp only for land cells and reuse a prebuilt land-only adjacency graph in both rainfall paths
  - isolated recheck confirmed this is still exact-preserving on the current branch; rainfall/post-pipeline reverted when the patch was removed
- `src/model/climate/ice.ts`
  - big-bet version: precomputed annual transfer / replay model with direct reference coverage
  - large kept win with no observed downstream drift; stable rerun improved `Post: ice` from about `314.6ms` to about `46.4ms` and `orogen:total` from about `11.284s` to about `10.106s`
- `src/model/pipelines/generate-default-world.smoke.test.ts`
  - exact fingerprint and river/lake regression checks
- `src/planet/controls/GenerationPanel.tsx`
  - dedicated post timing breakdown view

## Tried and rejected

### Rivers

- broader `computeRivers()` routing / loop narrowing rewrites
  - changed fingerprint and/or failed to produce a believable win
- passing cached `basinNeighborCount` from `selectConnectedLakeCells()` into `trimLakeCorridors()`
  - preserved outputs but the timing was too noisy to justify landing
  - observed:
    - one run about `Post: rivers 683.2ms`
    - reverted baseline about `698.9ms`
    - rerun about `717.2ms`
  - do not retry in this form
- anything that changes:
  - drainage traversal order
  - thresholding behavior
  - lake selection / pruning criteria
  - river tracing order

### Elevation / hotspots

- several loop-hoist / loop-trim passes in:
  - `src/model/terrain/elevation.ts`
  - `src/model/terrain/hotspots.ts`
- these were noisy or regressive and were reverted
- fused `computeDistanceFields()` ocean-membership caching / coast-barrier seed collection pass
  - preserved outputs but regressed `orogen:distance-fields`
  - observed:
    - baseline about `238.8ms`
    - first variant about `392.7ms`
    - adjusted variant about `276.5ms`
  - do not retry in this form
- conservative 3D spatial-bucket broad phase for hotspot dome checks
  - preserved outputs but was not a clear win for `orogen:hotspots`
  - observed:
    - baseline about `322.9ms`
    - bucketed variant about `329.9ms`
  - do not retry in this form
- cached hotspot winner `candidateRegion` reuse in place of a second `findNearestR()`
  - preserved outputs but was not a clear win for `orogen:hotspots`
  - observed:
    - baseline about `348.5ms`
    - cached-nearest variant about `349.3ms`
  - do not retry in this form
- hotspot dome cap-BFS / neighbor-traversal broad-phase
  - materially faster hotspot stage, but changed fingerprint
  - observed:
    - warm isolated baseline about `310.5ms`
    - variant about `257.1ms`
    - confirm rechecks about `378.5ms -> 230.9ms / 245.9ms`
  - river/lake summary held; land-only vegetation/climate/topography distributions held
  - candidate-kept only if fingerprint drift is acceptable or the drift source can be removed

### Ice

- splitting `computeIceAccumulation()` into separate land / ocean passes
  - preserved output but got slower, so reverted

### Avoid repeating unless the angle is materially different

- speculative micro-opts around `Math.pow`, `Math.max`, `Math.min`, branch reshaping, or small algebra rewrites without a clear allocation / traversal win
- repeating the earlier hotspot / elevation micro-optimizations as-is
- direct `isLand` scan + rolling monthly index rewrite in `computeHydrologyFields()`
  - preserved outputs but regressed `Post: hydrology` (`106.7ms` baseline -> `125.4ms`)
  - do not retry in this form

## Worth trying next

### Highest priority

1. `src/model/terrain/rivers.ts`
   - precompute per-target monthly pass-through or find an exact-preserving threshold-selection win
2. `src/model/terrain/classification.ts`
   - only big-bet topography simplifications that improve end-to-end runtime, not just isolated `Post: topography`
3. `src/model/climate/rain.ts`
   - only materially different advection/rainfall approaches; the prep-sharing variant was reverted

### Secondary

- materially different river-lake helper reuse only if it avoids the already-rejected basinNeighborCount pass-through shape

## Active delegated attempts

### Attempt A: topography slope-score cleanup

- Scope:
  - `src/model/terrain/classification.ts`
- Goal:
  - test whether `computeSlopeScore()` can reduce sort / container overhead without changing outputs
- Status:
  - landed
- Outcome:
  - replaced `Array.from(smoothedSlope).sort(...)` with `smoothedSlope.slice().sort()`
  - exact smoke fingerprint held
  - river/lake summary and land-only distributions held
  - validation run reported about `Post: topography 107.8ms` and `orogen:total 9.769s`

### Attempt B: distance-field ocean-mask caching

- Scope:
  - `src/model/terrain/elevation.ts`
- Goal:
  - materialize and reuse region ocean membership inside `computeDistanceFields()`
- Status:
  - rejected
- Outcome:
  - fused coast / ocean-barrier seed collection while caching region ocean membership
  - exact smoke fingerprint held
  - river/lake summary and land-only distributions held
  - stage regressed:
    - baseline about `238.8ms`
    - first variant about `392.7ms`
    - adjusted variant about `276.5ms`
  - do not retry in this form

### Attempt C: climate geometry caching

- Scope:
  - `src/model/climate/climate.ts`
- Goal:
  - cache mesh-derived latitude / band state used by `computeLandFraction()` and `computeMonthlyDaylightHours()`
- Status:
  - landed
- Outcome:
  - added deterministic same-mesh geometry caching for latitude / band lookups
  - exact smoke fingerprint held
  - river/lake summary and land-only distributions held
  - validation runs improved `Post: climate` from about `331.9ms` to about `240.8ms` / `310.9ms`

### Attempt D: hotspot spatial bucketing

- Scope:
  - `src/model/terrain/hotspots.ts`
- Goal:
  - narrow hotspot dome influence checks with spatial bucketing / neighborhood filtering before expensive warp/noise work
- Status:
  - rejected
- Outcome:
  - tried a conservative 3D spatial-bucket broad phase in `src/model/terrain/hotspots.ts`
  - exact smoke fingerprint held
  - river/lake summary and land-only distributions held
  - stage was slightly worse:
    - baseline about `orogen:hotspots 322.9ms`
    - bucketed variant about `329.9ms`
  - do not retry in this form

### Attempt E: river allocation cleanup

- Scope:
  - `src/model/terrain/rivers.ts`
- Goal:
  - reduce allocation churn in river start collection / tracing while preserving exact ordering
- Status:
  - landed
- Outcome:
  - replaced `processOrder.filter(...).sort(...)` with manual river-start collection
  - reused one scratch `lineCells` buffer across traces
  - exact smoke fingerprint held
  - river/lake summary and land-only distributions held
  - kept validation runs improved `Post: rivers` from about `690.7ms` to about `589.3ms` / `599.9ms`

### Attempt F: hotspot nearest-region reuse

- Scope:
  - `src/model/terrain/hotspots.ts`
- Goal:
  - remove duplicate `findNearestR()` work in hotspot candidate handling
- Status:
  - rejected
- Outcome:
  - reused the winning hotspot candidate's `candidateRegion` as `centerR`
  - exact smoke fingerprint held
  - river/lake summary and land-only distributions held
  - stage was effectively flat/slightly worse:
    - baseline about `orogen:hotspots 348.5ms`
    - cached-nearest variant about `349.3ms`
  - do not retry in this form

### Attempt H: hydrology setup churn

- Scope:
  - `src/model/climate/hydrology.ts`
- Goal:
  - reduce setup churn in `computeHydrologyFields()`
- Status:
  - rejected
- Outcome:
  - replaced `landRegions` precollection with a direct `isLand` scan plus rolling monthly index loops
  - exact smoke fingerprint held
  - river/lake summary and land-only distributions held
  - stage regressed from about `Post: hydrology 106.7ms` to about `125.4ms`
  - do not retry in this form

### Attempt G: in-place hotspot clamping

- Scope:
  - `src/model/pipelines/generate-world.ts`
- Goal:
  - avoid allocating a second hotspot array in `clampHotspots()` / active-path / stagnant-path handling
- Status:
  - landed
- Outcome:
  - clamp the hotspot contribution buffer in place and return the same `Float32Array`
  - exact smoke fingerprint held
  - river/lake summary and land-only distributions held
  - kept smoke validations improved `orogen:hotspots` from about `394.7ms` to about `363.2ms` / `351.0ms`

### Attempt I: river basin neighbor-count reuse

- Scope:
  - `src/model/terrain/rivers.ts`
- Goal:
  - reuse basin neighbor-count work across `selectConnectedLakeCells()` and `trimLakeCorridors()`
- Status:
  - rejected
- Outcome:
  - passed cached `basinNeighborCount` from `selectConnectedLakeCells()` into `trimLakeCorridors()`
  - exact smoke fingerprint held
  - river/lake summary and land-only distributions held
  - timing was too noisy to justify landing:
    - one run about `Post: rivers 683.2ms`
    - reverted baseline about `698.9ms`
    - rerun about `717.2ms`
  - do not retry in this form

### Attempt J: topography big bet

- Scope:
  - `src/model/terrain/classification.ts`
- Goal:
  - allow classification drift if topography speedup is large enough to be worth it
- Status:
  - rejected
- Outcome:
  - sped up `Post: topography` from about `96.8ms` to about `62.7ms` in one run
  - changed fingerprint (`f63da375...` -> `e1e80d...`)
  - river/lake summary held
  - land-only climate and vegetation distributions held
  - land-only topography distribution drift was small (`flat +2`, `plateau +1`, `mountains -3`)
  - end-to-end runtime was not compelling or stable (`10.760s` -> `12.444s`, then worse on confirm)
  - rejected and reverted

### Attempt K: rainfall big bet

- Scope:
  - `src/model/climate/rain.ts`
- Goal:
  - allow fingerprint drift if rainfall-path speedup is compelling enough
- Status:
  - landed
- Outcome:
  - run rain-band warp only for land cells
  - reuse a prebuilt land-only adjacency graph in both rainfall paths
  - initial parallel-era read suggested fingerprint drift, but isolated recheck overturned that
  - isolated recheck baseline was current branch state with exact fingerprint `f63da375...`
  - isolated revert was slower every time:
    - `Post: rainfall` `815 -> 1206ms` and `959 -> 1278ms`
    - `orogen:post-pipeline` `4203 -> 4798ms` and `4797 -> 5319ms`
    - `orogen:total` `10.212 -> 10.874s` and `12.054 -> 15.996s`
  - isolated recheck showed river/lake summary and land-only vegetation/climate/topography distributions stayed exact
  - final judgment: landed exact-preserving win on the current branch, not a fingerprint-changing candidate

### Attempt L: ice big bet

- Scope:
  - `src/model/climate/ice.ts`
- Goal:
  - allow a materially different ice optimization if the speedup is large enough and output drift stays acceptable
- Status:
  - landed
- Outcome:
  - rewrote `ice.ts` around a precomputed annual transfer / replay model
  - exact smoke fingerprint held
  - river/lake summary held
  - no material change observed in land-only vegetation / climate / topography distributions
  - stable rerun improved:
    - `Post: ice` about `314.6ms` -> `46.4ms`
    - `orogen:total` about `11.284s` -> `10.106s`
  - worth keeping

### Attempt M: isolated classification pass-fusion

- Scope:
  - `src/model/terrain/classification.ts`
- Goal:
  - defer marsh noise work until actual marsh-candidate evaluation to reduce topography cost
- Status:
  - rejected
- Outcome:
  - improved `Post: topography` from about `129.6ms` -> `95.7ms` (`117.4ms -> 91.7ms` on recheck)
  - exact smoke fingerprint held
  - river/lake summary held
  - land-only vegetation / climate / topography distributions held
  - end-to-end signal was too noisy / weak to justify landing

### Attempt N: isolated hotspot cap-BFS big bet

- Scope:
  - `src/model/terrain/hotspots.ts`
- Goal:
  - replace full-region dome scans with per-dome neighbor traversal from each dome center
- Status:
  - landed
- Outcome:
  - improved `orogen:hotspots` from about `310.5ms` -> `257.1ms`
  - confirm rechecks improved about `378.5ms -> 230.9ms / 245.9ms`
  - changed fingerprint to `0a9f9d54...`
  - river/lake summary held
  - land-only vegetation / climate / topography distributions held
  - drift analysis showed the fingerprint change comes from tiny floating-point accumulation-order differences in hotspot uplift / elevation, not from land-mask or categorical-output changes
  - accepted and kept

### Attempt O: pasta debug recomputation removal

- Scope:
  - `src/model/climate/pasta.ts`
- Goal:
  - stop recomputing debug-only climate metrics after classification and reuse the values already produced during classification
- Status:
  - landed
- Outcome:
  - changed `classifyOcean()` / `classifyLand()` to return computed metrics used by debug output
  - exact smoke fingerprint held (`0a9f9d54...`)
  - isolated A/B improved `Post: pasta climate` from about `615.7ms` to about `406.3ms`
  - isolated A/B also improved `orogen:total` from about `14.35s` to about `11.44s` despite shared-environment noise
  - worth keeping

### Attempt P: river target pass-through precompute

- Scope:
  - `src/model/terrain/rivers.ts`
- Goal:
  - precompute target-cell monthly pass-through factors so the reverse downstream accumulation loop only does multiply/add work
- Status:
  - rejected
- Outcome:
  - exact smoke fingerprint held (`0a9f9d54...`)
  - one shared-environment smoke sample looked promising, but isolated A/B rejected it
  - isolated A/B `Post: rivers` regressed from about `637.2ms` to about `661.1ms`
  - isolated A/B `orogen:post-pipeline` also regressed from about `4146.2ms` to about `4234.5ms`
  - `orogen:total` moved from about `10180ms` to about `10121ms`, which looked like noise rather than a real win
  - do not retry in this form

### Attempt Q: dual-advection huge bet

- Scope:
  - `src/model/climate/rain.ts`
- Goal:
  - replace the two independent east/west moisture propagations in `computeAdvection()` with one shared dual-state traversal
- Status:
  - rejected
- Outcome:
  - smoke fingerprint changed from `0a9f9d54...` to `3dc73628...`
  - smoke distributions also drifted (`provinceCount 4329 -> 4268`, `nationCount 680 -> 672`)
  - `Post: moisture advection` regressed badly to about `2308.8ms`
  - `orogen:post-pipeline` regressed to about `6168.0ms`
  - `orogen:total` regressed to about `13.049s`
  - too slow and too disruptive to keep

### Isolated recheck: last three experiments

- Single-agent sequential recheck in one context, no parallel attempt overlap
- Baseline: current branch state with exact fingerprint `f63da375...`
- Result:
  - topography big bet stays rejected
  - rainfall big bet is actually a landed exact-preserving win on the current branch
  - ice big bet stays landed

## Instrumentation still worth adding

### Rivers

- split `computeRivers()` timing into:
  - monthly flow accumulation
  - basin labeling
  - lake selection / trimming
  - thresholding
  - polyline tracing

### Topography

- split `classifyTopography()` timing into:
  - slope-score accumulation
  - slope quantile / normalization
  - marsh / adjacency prep
  - final classification

### Climate

- split `Post: climate` further into:
  - `computeTemperature`
  - monthly daylight / land fraction prep
  - DTR / PET fill
  - DTR min / max application
- split rainfall timing into:
  - TEQ setup
  - rainfall assembly
  - noise application
  - smoothing
  - annual aggregation

### Hotspots / elevation

- time each BFS / sub-pass in `computeDistanceFields()`
- time hotspot candidate selection vs dome application vs region sweeps

## Validation rule

Treat any optimization as invalid unless:

- the fingerprint stays exact
- the smoke river/lake summary stays exact
- the timing gain is believable rather than one-run noise

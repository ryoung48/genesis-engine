# Snapshot optimization plan

## Goal

Speed up history scrubbing and history jumps by taking expensive, details-only work out of the main `historyQuery.getView(...)` path.

## What we know

- Snapshot generation is the main bottleneck, not downstream display projection.
- The heaviest isolated snapshot costs are:
  - wealth computation
  - raw timeline reads
  - adjacency rebuild as a smaller secondary cost
- Final cloning is not the first optimization target.

## Benchmark results

- Large-history smoke test on the current synthetic fixture:
  - `getView(...)`: about `151.9 ms`
  - downstream display projection: about `19.9 ms`
  - ratio: about `7.64x`
- Isolated attribution run on the current synthetic fixture:
  - `getView(...)`: about `81.7 ms`
  - reads: about `39.5 ms`
  - hierarchy/color/leader derivation: about `16.5 ms`
  - adjacency rebuild: about `22.4 ms`
  - wealth: about `52.5 ms`
  - clone: about `8.9 ms`
- Current workspace baseline before experiment loop:
  - `getView(...)`: about `138.5 ms`
  - downstream display projection: about `13.8 ms`
  - ratio: about `10.00x`
  - isolated attribution:
    - `getView(...)`: about `54.8 ms`
    - reads: about `25.4 ms`
    - hierarchy/color/leader derivation: about `11.5 ms`
    - adjacency rebuild: about `18.1 ms`
    - wealth: about `36.8 ms`
    - clone: about `7.2 ms`

## Interpretation

- The overall bottleneck is clearly snapshot construction, not projection into display models.
- Wealth and raw timeline reads are the first places worth optimizing.
- Adjacency is expensive enough to matter, but it is not the dominant cost.
- Cloning is measurable but small enough that it should not be the first optimization target.
- The current single-entry snapshot cache only helps when the exact same time is requested again; it does not help normal scrubbing across many distinct timestamps.

## Current UI dependencies

- **Wealth** is only needed by the Nation Details history chart.
- **Adjacency** is only needed by the Nation Details political neighbors table.
- Map rendering, hover, and general political display do not appear to require precomputed snapshot wealth or adjacency.

## Proposed plan

1. **Create a fast scrub snapshot path**
   - Keep the fields needed for map rendering, hover, selection, ruler/dynasty display, wars, population, and development.
   - Remove eager snapshot-wide wealth and nation adjacency computation from the default scrub path.

2. **Compute adjacency lazily for Nation Details**
   - Replace snapshot-wide `adjOffset` / `adjList` rebuilding with an on-demand helper that derives neighbors for the selected nation from:
     - current nation assignment
     - static province adjacency
   - Cache by selected snapshot time and nation id where useful.

3. **Compute wealth lazily for Nation Details history**
   - Move current/optimal wealth calculation out of the default `getView(...)` path.
   - Add a details-scoped helper that computes wealth only for:
     - the selected nation
     - the visible history window used by Nation Details
   - Memoize by time and nation id so repeat chart renders do not redo the same work.

4. **Leave hierarchy/state reads in the main snapshot for now**
   - The snapshot still needs assignment, parent, sovereign, leader fields, colors, wars, and core population/development data.
   - After the lazy adjacency/wealth split lands, re-measure before touching lower-priority work.

5. **Re-run perf attribution after each isolation step**
   - Measure:
     - baseline `getView(...)`
     - fast scrub path
     - Nation Details open with neighbor table
     - Nation Details history chart open
   - Confirm scrubbing gets faster without shifting the same cost into common UI flows.

## Other things worth trying

1. **Reduce repeated timeline searches**
   - The raw read phase still looks expensive.
   - A likely next step is replacing repeated per-field binary searches with monotonic cursors or another incremental read strategy when scrubbing forward/backward through nearby times.

2. **Split snapshot levels instead of one all-purpose snapshot**
   - Keep a minimal render snapshot for the map.
   - Layer optional detail computations on top for Nation Details and other slower side panels.

3. **Avoid rebuilding broad structures with JS maps/sets when possible**
   - Child maps, neighbor sets, and recursive caches are convenient but not cheap.
   - If lazy adjacency/wealth is not enough, consider moving more of that work to typed-array-based scratch structures.

4. **Benchmark realistic interaction patterns**
   - Current tests are synthetic and useful for directionality.
   - Add targeted measurements for:
     - slider scrubbing across dense timestamps
     - clicking history chart events repeatedly
     - opening/closing Nation Details while paused at a single time

5. **Check whether some snapshot fields can become optional**
   - If more fields are only consumed by details surfaces, consider making them lazy as well rather than keeping them in the base snapshot forever.

6. **Only optimize cloning after the larger wins land**
   - Copy reduction may still help, but the current numbers suggest it is unlikely to produce the biggest visible improvement by itself.

## Notes and cautions

- Wealth is used by the Nation Details history chart, so removing it from `getView(...)` requires a replacement details-only source.
- Adjacency is used by the Nation Details political neighbors table, so removing it from `getView(...)` requires a replacement neighbor derivation path.
- Any lazy path should be measured with the details panel open, not just with the map alone, to avoid shifting cost into a worse user-visible moment.

## Expected payoff

- Faster time-slider scrubbing and history jumps in the common case.
- Expensive work only happens when the user opens Nation Details surfaces that actually need it.
- Better separation between map snapshot data and detail-panel derived data.

## Experiment log

### Baseline

- Command: `pnpm exec vitest run --project unit src\planet\screen\history\history-query.test.ts -t "smoke-tests"`
- Result:
  - keep as control baseline for all experiment grading
  - use current workspace numbers above, not the earlier run, when comparing follow-up experiments

### Experiment 1: lazy adjacency for Nation Details neighbors

- Owner: subagent
- Scope:
  - remove eager snapshot adjacency materialization from `getView(...)`
  - derive Nation Details neighbor ids lazily from current assignment plus static province adjacency
- Files changed:
  - `src\planet\screen\history\history-query.ts`
  - `src\planet\screen\display\nation-details-model.ts`
  - `src\planet\screen\display\nation-details-model.test.ts`
- Benchmark:
  - `[snapshot smoke] provinces=4000 samples=18 getView=111.2ms projection=15.1ms ratio=7.36x`
  - `[snapshot attribution] provinces=4000 getView=37.4ms reads=25.7ms hierarchy=11.2ms adjacency=17.7ms wealth=36.4ms clone=7.5ms`
- Delta vs baseline:
  - `getView`: `-27.3ms`
  - `projection`: `+1.3ms`
  - attribution `getView`: `-17.4ms`
  - attribution `adjacency`: effectively flat in the synthetic sub-phase replay
- Grade: **A**
- Decision: **KEEP**
- Notes:
  - This is a strong win on the end-to-end benchmark with minimal behavioral scope.
  - The attribution test still manually replays an adjacency phase, so its `adjacency` bucket does not prove that real `getView(...)` still pays that cost; the real signal here is the reduced `getView(...)` timing.
  - Projection got slightly slower, which is acceptable for now because the main user-visible gain is faster snapshot creation during scrubbing.

### Experiment 2: lazy wealth accessors for Nation Details history

- Owner: subagent
- Scope:
  - remove eager snapshot-wide wealth arrays from `getView(...)`
  - expose lazy wealth accessors on `HistoryView`
  - make Nation Details history read wealth through those accessors on demand
- Files changed:
  - `src\planet\screen\history\history-query.ts`
  - `src\planet\screen\history\history-query.test.ts`
  - `src\planet\screen\display\nation-details-model.ts`
  - `src\planet\screen\display\nation-details-model.test.ts`
  - `src\planet\OrogenView.tsx`
- Benchmark:
  - `[snapshot smoke] provinces=4000 samples=18 getView=42.6ms projection=16.6ms ratio=2.56x`
  - `[snapshot attribution] provinces=4000 getView=26.9ms reads=24.3ms hierarchy=12.1ms adjacency=18.0ms wealth=42.8ms clone=7.2ms`
- Delta vs original baseline:
  - `getView`: `-95.9ms`
  - `projection`: `+2.8ms`
  - attribution `getView`: `-27.9ms`
- Delta vs accepted experiment 1 state:
  - `getView`: `-68.6ms`
  - `projection`: `+1.5ms`
  - attribution `getView`: `-10.5ms`
- Grade: **A+**
- Decision: **KEEP**
- Notes:
  - This is the highest-value result so far by a wide margin.
  - The attribution replay still times a synthetic wealth phase, so its `wealth` bucket is no longer measuring eager `getView(...)` work after this change.
  - Projection got a bit slower again, but the end-to-end snapshot improvement is large enough that this trade still looks decisively worthwhile.

### Experiment 3: monotonic read cursors in `getView(...)`

- Owner: subagent
- Scope:
  - try stateful per-province monotonic timeline cursors for hot province reads
  - keep binary-search fallback for backward or non-monotonic jumps
- Files changed during experiment:
  - `src\planet\screen\history\history-query.ts`
  - `src\planet\screen\history\history-query.test.ts`
- Benchmark during experiment:
  - `[snapshot smoke] provinces=4000 samples=18 getView=86.5ms projection=18.5ms ratio=4.67x`
  - `[snapshot attribution] provinces=4000 getView=43.9ms reads=30.1ms hierarchy=13.1ms adjacency=19.1ms wealth=47.9ms clone=8.3ms`
- Delta vs accepted experiment 1 + 2 state:
  - `getView`: `+43.9ms`
  - `projection`: `+1.9ms`
  - attribution `getView`: `+17.0ms`
- Grade: **D**
- Decision: **DROP**
- Notes:
  - The added cursor state and branchier logic made the benchmark materially worse.
  - This did not justify its complexity or risk.
  - The same attribution limitation still applied, but the end-to-end `getView(...)` regression was already enough to reject it.

### Current recommended landing point

- Keep:
  - experiment 1 lazy adjacency
  - experiment 2 lazy wealth
- Drop:
  - experiment 3 monotonic read cursors
- Restored benchmark after dropping experiment 3:
  - `[snapshot smoke] provinces=4000 samples=18 getView=39.6ms projection=12.7ms ratio=3.12x`
  - `[snapshot attribution] provinces=4000 getView=31.9ms reads=25.6ms hierarchy=12.3ms adjacency=18.4ms wealth=38.8ms clone=7.3ms`
- Takeaway:
  - The best current path is to keep expensive details-only work off the eager snapshot path.
  - The next promising area is still raw reads, but not with the attempted cursor design.

## Second experiment wave

- Fresh control before wave 2:
  - `[snapshot smoke] provinces=4000 samples=18 getView=40.7ms projection=13.5ms ratio=3.01x`
  - `[snapshot attribution] provinces=4000 getView=49.2ms reads=27.4ms hierarchy=14.2ms adjacency=20.5ms wealth=38.2ms clone=8.7ms`
- Five isolated ideas to test next:
  1. remove now-unused eager `scratchChildMap` work from `getView(...)`
  2. reuse shared immutable empty adjacency arrays instead of slicing them every view
  3. collapse active-war filtering and cloning into a cheaper single-pass snapshot build
  4. replace `scratchOccupationGroups` map accumulation with a cheaper bucket structure
  5. optimize the sovereign derivation pass with per-snapshot memoization/path compression

### Wave 2 / Experiment 4: remove eager `scratchChildMap`

- Owner: subagent
- Isolation: experiment reverted before return; workspace restored to control state
- Files touched:
  - `src\planet\screen\history\history-query.ts` (restored)
- Benchmark:
  - `[snapshot smoke] provinces=4000 samples=18 getView=37.5ms projection=12.4ms ratio=3.02x`
  - `[snapshot attribution] provinces=4000 getView=30.3ms reads=27.1ms hierarchy=12.7ms adjacency=20.7ms wealth=39.6ms clone=8.3ms`
- Delta vs wave-2 control:
  - `getView`: `-3.2ms`
  - `projection`: `-1.1ms`
  - attribution `getView`: `-18.9ms`
- Finding:
  - eager `scratchChildMap` work is now dead inside `getView(...)`
- Decision:
  - **KEEP CANDIDATE**
- Notes:
  - The subagent recommended drop, but the measured result moved in the right direction and confirmed this is avoidable eager work.
  - Because the workspace was restored for isolation, this remains a candidate to reapply rather than a landed change.

### Wave 2 / Experiment 5: share empty adjacency arrays

- Owner: subagent
- Isolation: experiment reverted before return; workspace restored to control state
- Files touched:
  - `src\planet\screen\history\history-query.ts` (restored)
- Benchmark:
  - `[snapshot smoke] provinces=4000 samples=18 getView=125.7ms projection=12.2ms ratio=10.28x`
  - `[snapshot attribution] provinces=4000 getView=61.7ms reads=26.9ms hierarchy=11.8ms adjacency=18.2ms wealth=42.6ms clone=7.8ms`
- Delta vs wave-2 control:
  - `getView`: `+85.0ms`
  - `projection`: `-1.3ms`
  - attribution `getView`: `+12.5ms`
- Decision:
  - **DROP**
- Notes:
  - Shared empty `adjOffset` is not actually immutable in a safety sense because callers could mutate the shared typed array.
  - Even ignoring that caveat, the benchmark moved sharply in the wrong direction.

### Wave 2 / Experiment 6: single-pass active war shaping

- Owner: subagent
- Isolation: experiment reverted before return; workspace restored to control state
- Files touched:
  - `src\planet\screen\history\history-query.ts` (restored)
- Benchmark:
  - `[snapshot smoke] provinces=4000 samples=18 getView=117.7ms projection=13.4ms ratio=8.81x`
  - `[snapshot attribution] provinces=4000 getView=62.0ms reads=26.0ms hierarchy=12.7ms adjacency=20.1ms wealth=39.1ms clone=8.3ms`
- Delta vs wave-2 control:
  - `getView`: `+77.0ms`
  - `projection`: `-0.1ms`
  - attribution `getView`: `+12.8ms`
- Decision:
  - **DROP**
- Notes:
  - The current active-war filter/map plus clone path does not appear to be a meaningful bottleneck at this stage.
  - This was another case where an intuitively smaller code path still benchmarked worse.

### Wave 2 / Experiment 7: cheaper occupation buckets

- Owner: subagent
- Isolation: experiment reverted before return; workspace restored to control state
- Files touched:
  - `src\planet\screen\history\history-query.ts` (restored)
  - `src\planet\screen\history\history-query.test.ts` (restored)
- Benchmark:
  - agent-local baseline during run:
    - `[snapshot smoke] provinces=4000 samples=18 getView=135.3ms projection=17.8ms ratio=7.60x`
    - `[snapshot attribution] provinces=4000 getView=71.9ms reads=25.3ms hierarchy=12.4ms adjacency=20.5ms wealth=39.9ms clone=8.0ms`
  - experiment:
    - `[snapshot smoke] provinces=4000 samples=18 getView=127.6ms projection=18.3ms ratio=6.96x`
    - `[snapshot attribution] provinces=4000 getView=37.2ms reads=25.9ms hierarchy=12.0ms adjacency=18.6ms wealth=39.7ms clone=7.6ms`
- Delta vs wave-2 control:
  - `getView`: `+86.9ms`
  - `projection`: `+4.8ms`
- Decision:
  - **DROP**
- Notes:
  - The run was noisy, but even with that caveat the experiment lost badly against the actual wave-2 control.
  - Occupation grouping no longer looks like a promising lever relative to other remaining costs.

### Wave 2 / Experiment 8: sovereign-pass memoization

- Owner: subagent
- Isolation: experiment reverted before return; workspace restored to control state
- Files touched:
  - `src\planet\screen\history\history-query.ts` (restored)
- Benchmark:
  - agent-local baseline during run:
    - `[snapshot smoke] provinces=4000 samples=18 getView=129.9ms projection=15.4ms ratio=8.43x`
    - `[snapshot attribution] provinces=4000 getView=40.2ms reads=27.1ms hierarchy=12.0ms adjacency=17.8ms wealth=36.2ms clone=7.6ms`
  - experiment:
    - `[snapshot smoke] provinces=4000 samples=18 getView=139.4ms projection=20.7ms ratio=6.73x`
    - `[snapshot attribution] provinces=4000 getView=47.5ms reads=37.1ms hierarchy=16.7ms adjacency=24.9ms wealth=43.5ms clone=10.9ms`
- Delta vs wave-2 control:
  - `getView`: `+98.7ms`
  - `projection`: `+7.2ms`
- Decision:
  - **DROP**
- Notes:
  - Small sovereign/hierarchy memoization looks unpromising in this code path.
  - The attempted optimization increased overall work rather than reducing it.

## Wave 2 conclusion

- Keep candidate:
  - remove eager `scratchChildMap` work from `getView(...)`
- Drop:
  - shared empty adjacency arrays
  - single-pass active war shaping
  - cheaper occupation buckets
  - sovereign-pass memoization
- Current takeaway:
  - After lazy adjacency and lazy wealth, most obvious micro-optimizations in the remaining eager path are not paying off.
  - The only wave-2 idea that still looks worth landing is removing the now-dead eager `scratchChildMap` work.
  - If more performance work is needed after that, the next best exploration area is likely broader read-path redesign rather than local micro-optimizations around wars, adjacency placeholders, or hierarchy bookkeeping.

## Read-path redesign exploration

- Current structural bottleneck:
  - `getView(...)` still does a full province scan and multiple per-province timeline lookups.
  - The core eager cost is now mostly repeated timeline reads rather than detail-only derivation work.
  - Current serialized timelines are field-local `times[]` / `values[]` / `offsets[]` blobs partitioned by province.

### What the UI actually does

- The dominant access pattern is **clustered local time navigation**, not arbitrary random access:
  - slider scrubbing repeatedly asks for nearby times
  - nation history rebuilds a short contiguous yearly window around the selected time
  - chart/event clicks are jumps, but usually still within a bounded local range
- That means the best redesigns should optimize:
  - nearby forward/backward movement
  - short local windows
  - repeated reuse around the currently selected time

### Best redesign candidates

1. **Delta-apply snapshots from a nearby prior view**
   - Keep a mutable scratch view plus ordered change application.
   - Move between nearby times by applying only the timeline changes crossed since the last time instead of rereading every province/field.
   - Best fit for slider scrubbing and repeated local window queries.
   - Cost: high implementation complexity; likely needs a new change-log-oriented query layer.

2. **Periodic keyframes plus local delta replay**
   - Precompute or serialize sparse checkpoint snapshots, then replay only nearby changes from the nearest keyframe.
   - Better for nonlocal jumps than pure delta-apply and safer than relying on one mutable prior state.
   - Cost: moderate-to-high worker/query changes and higher memory footprint.

3. **Batched/windowed history reads**
   - Add a query path for local time windows used by Nation Details history instead of calling `getView(...)` 11 times in a loop.
   - This is narrower than a full read-path redesign but strongly aligned with real UI behavior.
   - Cost: moderate query/API work, lower structural risk than full delta application.

4. **Packed hot-field timeline layout**
   - Reserialize hot fields (`parent`, `assignment`, population, development, consumption, occupation) into a more locality-friendly packed layout.
   - Goal: cut repeated binary searches and improve memory locality.
   - Cost: high worker transport churn and more invasive format changes.

5. **Recent-time multi-entry cache**
   - Expand beyond the current single-entry cache to keep a small recent-time working set.
   - Lower upside than true delta application, but cheap compared to changing the serialization format.
   - Best seen as a supporting optimization, not the main redesign.

### Feasibility notes

- **Most feasible with current architecture:**
  - periodic keyframes
  - batched/windowed history reads
  - small recent-time caches
- **Most promising long-term but broader:**
  - delta-apply snapshots from change streams
  - packed hot-field timeline layout
- **Less promising after current experiments:**
  - local hierarchy/war/occupation bookkeeping tweaks without changing how reads happen

### Recommended order of future exploration

1. land the wave-2 keep candidate: remove dead eager `scratchChildMap`
2. prototype a **windowed/batched Nation Details history query**
3. prototype a **small recent-time cache** or **local time-window cache**
4. if those are insufficient, explore **keyframes + delta replay**
5. reserve **full delta-apply / packed timeline layout** for a larger format-level redesign

## Benchmark semantics note

- The attribution smoke test has been corrected to match the current eager `getView(...)` path.
- It now reports eager buckets for:
  - `reads`
  - `hierarchy`
  - `wars`
  - `summary`
  - `clone`
- It reports `lazyWealthAccess` separately so the benchmark no longer implies that wealth is still eagerly computed inside `getView(...)`.

## Five solid next ideas

These are the strongest current candidates after the lazy adjacency / lazy wealth work and two waves of micro-benchmarking. Estimated ranges below are rough 10k-province targets derived from the current corrected attribution shape:

- current 10k reference:
  - `getView=81.5ms`
  - `reads=98.8ms`
  - `hierarchy=29.7ms`

| Idea | How it would work | Est. `getView` gain | Est. `reads` gain | Est. `hierarchy` gain | Complexity | Verdict |
| --- | --- | ---: | ---: | ---: | --- | --- |
| **1. Sparse per-province checkpoints / jump index** | Add coarse jump points inside each province timeline so reads start from a nearby checkpoint instead of full binary search across the whole local span. | **10-25ms** | **20-40ms** | 0-2ms | Medium | Best near-term read-path experiment |
| **2. Small local bracket cache for timeline reads** | Cache last successful index/bracket per hot field/province or per time bucket; reuse only when the next query is nearby, otherwise fall back safely. | **5-15ms** | **10-25ms** | 0-1ms | Low-Medium | Good low-risk follow-up |
| **3. Keyframes + local delta replay** | Serialize sparse checkpoint snapshots, then replay only nearby changes from the nearest keyframe instead of rereading every province field from scratch. | **20-40ms** | **25-45ms** | **5-10ms** | High | Stronger but broader redesign |
| **4. Packed hot-field timeline layout** | Reserialize hot fields (`parent`, `assignment`, population, development, consumption, occupation, leader fields) into a locality-friendly packed format to reduce repeated searches and pointer chasing. | **15-35ms** | **20-40ms** | **3-8ms** | High | Best format-level redesign candidate |
| **5. Root-first forest traversal for hierarchy** | Replace per-province parent climbing with one root-first forest walk that assigns sovereigns, clears non-sovereign leader fields, and colors in a single structured pass. | **3-10ms** | 0-2ms | **5-12ms** | Medium | Best hierarchy-specific candidate |

### Notes on why these survived

- These are stronger than the rejected experiments because they change either:
  - how reads are indexed,
  - how timeline data is laid out,
  - or how hierarchy is traversed structurally,
  rather than just tweaking small bookkeeping details.
- The previous monotonic cursor attempt failed because it was too stateful and branchy; the read candidates above are safer because they are either:
  - stateless/time-addressed (checkpoints),
  - bounded and fallback-safe (local bracket caches),
  - or explicit data-layout changes (keyframes / packed fields).

### Recommended next order

1. land the dead `scratchChildMap` removal
2. prototype **sparse per-province checkpoints / jump index**
3. prototype **small local bracket cache**
4. if those are still not enough, choose between:
   - **keyframes + local delta replay**
   - **packed hot-field timeline layout**
5. separately, if hierarchy still matters after read wins, prototype **root-first forest traversal**

## 10k confirmation experiments

- 10k control:
  - `[snapshot smoke] provinces=10000 samples=18 getView=81.5ms projection=40.9ms ratio=1.99x`
  - `[snapshot attribution] provinces=10000 getView=62.7ms reads=98.8ms hierarchy=29.7ms wars=0.1ms summary=4.0ms clone=10.0ms lazyWealthAccess=180.4ms`

### 10k / Experiment 1: sparse per-province checkpoints / jump index

- Owner: subagent
- Isolation: experiment reverted before return; workspace restored
- Mechanism:
  - per-field, per-province 8-bucket stateless jump table
  - each read mapped target time to a province-local bucket, jumped to a stored absolute index, then adjusted locally
- Benchmark samples:
  - `[snapshot smoke] provinces=10000 samples=18 getView=149.1ms projection=48.5ms ratio=3.07x`
  - `[snapshot attribution] provinces=10000 getView=92.3ms reads=121.1ms hierarchy=39.6ms wars=0.1ms summary=4.3ms clone=12.1ms lazyWealthAccess=266.8ms`
  - `[snapshot smoke] provinces=10000 samples=18 getView=147.8ms projection=45.2ms ratio=3.27x`
  - `[snapshot attribution] provinces=10000 getView=83.5ms reads=88.5ms hierarchy=33.0ms wars=0.0ms summary=3.8ms clone=9.1ms lazyWealthAccess=185.8ms`
  - `[snapshot smoke] provinces=10000 samples=18 getView=145.5ms projection=48.6ms ratio=2.99x`
  - `[snapshot attribution] provinces=10000 getView=102.1ms reads=114.2ms hierarchy=26.4ms wars=0.1ms summary=4.7ms clone=10.4ms lazyWealthAccess=224.8ms`
- Median delta vs 10k control:
  - `getView`: `+66.3ms`
  - `projection`: `+7.6ms`
  - `reads`: `+15.4ms`
- Decision:
  - **DROP**
- Notes:
  - The added jump-table lookup overhead outweighed any binary-search savings in this prototype.

### 10k / Experiment 2: small local bracket cache

- Owner: subagent
- Isolation: experiment reverted before return; workspace restored
- Mechanism:
  - 8-slot per-province/per-field bracket cache keyed by 10ms time bucket
  - cached last successful lower index, validated locally, otherwise fell back to binary search
- Benchmark:
  - `[snapshot smoke] provinces=10000 samples=18 getView=322.3ms projection=80.2ms ratio=4.02x`
  - `[snapshot attribution] provinces=10000 getView=106.2ms reads=125.0ms hierarchy=35.0ms wars=0.1ms summary=5.3ms clone=15.1ms lazyWealthAccess=280.2ms`
- Delta vs 10k control:
  - `getView`: `+240.8ms`
  - `projection`: `+39.3ms`
  - `reads`: `+26.2ms`
- Decision:
  - **DROP**
- Notes:
  - The bounded cache was safer than monotonic cursors, but the added cache bookkeeping cost still overwhelmed any local reuse benefit.

### 10k / Experiment 3: keyframes + local delta replay

- Owner: subagent
- Isolation: experiment reverted before return; workspace restored
- Prototype level:
  - real prototype with eager time-indexed keyframes, per-time delta buckets, replay into scratch buffers, and exact-time view caching
- Benchmark:
  - `[snapshot smoke] provinces=10000 samples=18 getView=11.8ms projection=40.9ms ratio=0.29x`
  - `[snapshot attribution] provinces=10000 getView=18.2ms reads=96.1ms hierarchy=27.2ms wars=0.0ms summary=8.2ms clone=10.5ms lazyWealthAccess=86.2ms`
- Delta vs 10k control:
  - `getView`: `-69.7ms`
  - `projection`: `+0.0ms`
  - `reads`: `-2.7ms`
  - `hierarchy`: `-2.5ms`
  - `lazyWealthAccess`: `-94.2ms`
- Decision:
  - **KEEP CANDIDATE**
- Notes:
  - This is the first 10k redesign experiment that clearly validates its architecture direction.
  - Important caveat: the reported win excludes upfront keyframe-build cost and benefits most from repeated timestamp reuse, so purely random access would likely improve less.

### 10k / Experiment 4: packed hot-field timeline layout

- Owner: subagent
- Isolation: experiment reverted before return; workspace restored
- Prototype level:
  - query-layer fast path only
  - packed aligned hot fields into one interleaved buffer with one binary search per province
- Benchmark:
  - `[snapshot smoke] provinces=10000 samples=18 getView=63.6ms projection=48.9ms ratio=1.30x`
  - `[snapshot attribution] provinces=10000 getView=34.6ms reads=60.9ms hierarchy=30.5ms wars=0.1ms summary=4.8ms clone=9.7ms lazyWealthAccess=155.5ms`
- Delta vs 10k control:
  - `getView`: `-17.9ms`
  - `reads`: `-37.9ms`
  - `projection`: `+8.0ms`
- Decision:
  - **KEEP CANDIDATE**
- Notes:
  - This validates the data-layout direction, especially for the read bucket.
  - Caveat: the prototype skipped a real build-cost and memory study, and projection was noisier than the control.

### 10k / Experiment 5: root-first forest traversal

- Owner: subagent
- Isolation: experiment reverted before return; workspace restored
- Mechanism:
  - one read pass
  - typed child-count / child-offset forest index
  - iterative root-first traversal to assign `sovereign`, zero non-sovereign leader fields, and assign colors in the same pass
- Benchmark:
  - `[snapshot smoke] provinces=10000 samples=18 getView=15.0ms projection=7.4ms ratio=2.03x`
  - `[snapshot attribution] provinces=10000 getView=15.0ms reads=10.9ms hierarchy=3.1ms wars=0.1ms summary=0.4ms clone=0.4ms lazyWealthAccess=11.7ms`
- Delta vs 10k control:
  - `getView`: `-66.5ms`
  - `reads`: `-87.9ms`
  - `hierarchy`: `-26.6ms`
  - `projection`: `-33.5ms`
- Decision:
  - **KEEP CANDIDATE**
- Notes:
  - This result is dramatically better than control, but confidence is lower than the keyframe and packed-layout experiments because the jump is so large.
  - Treat this as a strong signal to reproduce independently before trusting the exact magnitude.

## 10k experiment conclusion

- Keep candidates:
  - keyframes + local delta replay
  - packed hot-field timeline layout
  - root-first forest traversal
- Drops:
  - sparse per-province checkpoints / jump index
  - small local bracket cache
- Current takeaway:
  - bounded cache/index ideas did not pay off
  - broader structural changes did
  - the two strongest and most believable directions are:
    1. **keyframes + local delta replay**
    2. **packed hot-field timeline layout**
  - the hierarchy traversal result is promising, but needs a second confirming pass before being treated as equally trustworthy

## Implemented stack

- The current worktree now carries the three structural follow-ups on top of the lazy adjacency / lazy wealth baseline:
  1. **keyframes + local delta replay**
  2. **packed hot-field replay storage**
  3. **root-first / shared forest traversal helpers**

### Implemented step 1: keyframes + local delta replay

- Reported 10k benchmark after implementation:
  - `[snapshot smoke] provinces=10000 samples=18 getView=1.9ms projection=2.8ms ratio=0.69x`
  - `[snapshot attribution] provinces=10000 getView=1.9ms reads=0.3ms hierarchy=1.1ms wars=0.3ms summary=0.3ms clone=0.0ms lazyWealthAccess=0.9ms`
- Notes:
  - This moved the query layer away from full rereads and toward replay from prepared state.
  - Caveat from the implementation pass: backward jumps reload from the nearest keyframe rather than reverse-replaying.

### Implemented step 2: packed hot-field replay storage

- Reported 10k benchmark on top of keyframes:
  - `[snapshot smoke] provinces=10000 samples=18 getView=1.2ms projection=2.6ms ratio=0.47x`
  - `[snapshot attribution] provinces=10000 getView=1.2ms reads=0.3ms hierarchy=0.6ms wars=0.2ms summary=0.2ms clone=0.0ms lazyWealthAccess=0.8ms`
- Delta vs implemented keyframe step:
  - `getView`: `-0.7ms`
  - `projection`: `-0.2ms`
- Notes:
  - This suggests packed replay state still helps even after keyframes, though by a smaller margin than keyframes themselves.

### Implemented step 3: root-first / shared forest traversal

- Reported 10k benchmark on top of keyframes + packed hot:
  - `[snapshot smoke] provinces=10000 samples=18 getView=1.4ms projection=2.5ms ratio=0.55x`
  - `[snapshot attribution] provinces=10000 getView=1.4ms reads=0.3ms hierarchy=0.7ms wars=0.2ms summary=0.3ms clone=0.0ms lazyWealthAccess=0.6ms`
- Delta vs implemented keyframe + packed step:
  - `getView`: `+0.2ms`
  - `projection`: `-0.1ms`
  - `lazyWealthAccess`: `-0.2ms`
- Notes:
  - This did not improve `getView` further, but it may still help projection / lazy wealth by sharing forest structure.
  - Treat it as a weaker keep than keyframes or packed hot unless independently reconfirmed.

# Incremental road network

Scope: `:history` and society infrastructure. Search costs and bucket queues are described in [route search performance](route-search-performance.md).

## State and membership

The history adapter reads the engine's owned geography buffers and copies settlement anchors before generated-world buffers transfer to the browser. The transfer regression detaches the generation buffers and transfers every later journal while comparing road paths with a control engine.

`ROUTES.createState` caches static land passability, province components, region group IDs, water-depth penalties, search workspaces and projection centres. Each land group's centre uses every settlement that passes the static eligibility checks, independent of its population. A surviving settlement therefore retains exactly the same projected coordinates when other members enter or leave.

`ROUTES.advance` is the single build and update operation. Generation applies it once to empty state; history repeats that build after population initialization. At the default start year the two use identical urban population and produce identical routes. An explicit historical start year uses that year's knowledge and city targets. Worlds without settlement inputs keep `roads: null`.

Membership uses the run's fixed era: minor land and ports enter at `townMin`, major land above `2 × cityMin`. Existing geographic eligibility and isolated-town exclusions remain. A member leaves only below 70% of its threshold and after two batches of dwell. With ten-year batches, capped migration alone leaves `0.97^10 ≈ 73.7%`; the two-batch dwell also prevents immediate release after siege storms. A severe decline just after entry can retain roads for about twenty years.

## Batch order and local work

Groups retain first qualifying province order, candidates retain ascending province order, and land/sea pairs retain their previous sorted search order. Searches are sequential and see every previously built road.

1. Update tier membership and identify affected groups. Sea groups are also affected when a member crosses `cityMin`, which changes its route-length limit.
2. Add desired major land pairs from the group's Urquhart graph.
3. Add desired minor land pairs, excluding desired major pairs that actually hold a successful route.
4. Add desired sea-neighbour pairs.
5. Release obsolete routes and their edge references.

Release runs last so replacement routes can reuse a departing settlement's roads. Promotion adds a major route before removing its minor route; demotion searches a minor route before releasing its major route. Every completed batch has at most one land kind per province pair.

Desired pairs are retained per group. Only affected groups rebuild their pair sets; existing routes preserve their exact paths. Each destination kind owns its route and rejection maps. A rejected pair stores its last length limit: 1,000 km for minor land, 3,000 km for major land, and 2,500 or 5,000 km for sea depending on endpoint population. A sea rejection is retried only when that limit rises. Leaving a desired set removes its rejection.

Land, major-land and sea usage arrays count adjacency references. An edge is major whenever a major route uses it, otherwise minor while any land route uses it. Sea usage excludes the anchor-to-port edges. Network geometry and population weights are derived on demand through `ROUTES.network`.

The resulting network intentionally depends on settlement arrival order and can differ from a fresh build on the same final populations. Roads use no randomness and do not feed any other historical model.

## History, record and display

History advances roads after population in the census event when at least ten simulation years have elapsed since the preceding batch. Changed batches journal packed added and released routes. Those buffers transfer independently of the engine's stored paths.

The record retains one lifetime entry per accepted route, with kind, province endpoints, exact path, inclusive start and exclusive end. Releases close the active lifetime; subsequent additions create another entry. A frame filters lifetimes at its requested date. This preserves old paths without rerouting them out of order.

The display packs the frame's routes and derives its edge network only while infrastructure is visible. Globe and map marker builders and the label-name builder receive the route endpoint set. Endpoints retain markers and names even below `townMin`, until their roads are released. Capital marker styling uses the selected frame's capital-preferring nation seeds, so moved capitals gain the capital pattern and former or extinct capitals lose it; before history is available it uses the generated capital list. Imported Earth worlds retain their existing settlement display.

## Report

Every detailed-report window includes `roads`: route counts and unique network length in kilometres by kind; current membership counts; batch, membership-change, search, addition, release, rejection and retry totals; and a transition matrix ordered **none, minor, major, sea**. Only off-diagonal transitions count. `promoted` and `demoted` repeat the minor-to-major and major-to-minor cells. Sea additions and releases occupy none-to-sea and sea-to-none cells. Route-log entries and total added path-region counts describe retained history size.

Timing stays under `roads.timing`: initial routing batch milliseconds, total and maximum subsequent batch milliseconds, land/sea milliseconds and sea-neighbour discovery milliseconds. Overall engine initialization also includes static preprocessing; these timings are single samples on a shared machine.

`settlementChange` samples independent urban-population snapshots every ten years, including only provinces previously at least `townMin`. Ratios below 0.5 are `halved`; from 0.5 to below 0.737 are `shockFall`; 0.737 through 1.485 are `normal`; larger ratios are `surge`. The latter boundaries round `0.97^10` and `(1.01 × 1.03)^10` to three decimal places. Each band has a count and the share holding a land road at the end of the step. The five largest falls by ratio and by people lost include province, year and before/after population.

## Verification evidence

The refactor before fixed centres reproduced both saved production fingerprints (seeds 14963991 and 42). The final saved-world comparison for seed 14963991 is `stats/routes/2026-10-10T22-39-33-068Z-bidirectional-production/report.json`: 2,677 routes, 89 changed surviving paths, 13 added pairs and 13 removed pairs. Independent shortest-path and order checks found no violations. Survivor-pair flips across single-member additions fell from 2,804 with moving centroids to 2,586 with fixed centres; this measurement informs churn expectations and is not an acceptance threshold.

The equivalent 30-year slices at 204,000 points are `stats/history/2026-10-10T22-27-24-703Z-incremental-roads-before/30.json` and `stats/history/2026-10-10T22-34-11-550Z-incremental-roads-slice/30.json`. Existing behavioral fields match; execution timing and serialized-memory estimates vary. The three subsequent road batches total 379 ms, maximum 164 ms; the initial routing batch takes 522 ms. This exceeds the speculative 10–20 ms per-batch estimate because sea-neighbour discovery floods affected water bodies.

Focused smoke tests exercise promotions/demotions, usage recounts, release-last searches, unrelated groups, fixed projections, sea-limit retries, dwell after storms, exact historical frames, full non-road state/record equivalence, endpoint visibility with a negative control, and population-band boundaries and injected collapse.

The final completed equivalent 933-year comparison is `stats/history/2026-10-10T22-58-38-015Z-incremental-roads-final/933.json`, with `933-diff.html`, `comparison.md` and `verification.json` beside it. All existing behavioral statistics, annual snapshots and event digests match the single-urban-model baseline exactly. There are 94 batches, 12,955 final routes, 678 promotions and 252 demotions. Subsequent batches total 15.609 s (mean 167.8 ms, maximum 320.1 ms), exceeding the early workload estimate: 44,576 searches and repeated sea-neighbour discovery occur. Across all batches, land/sea stages take 2.743/13.427 s and sea-neighbour discovery alone takes 11.169 s. The lifetime log has 39,856 entries and 402,992 path-region elements. The report observes 1,077 shock falls and 154,196 normal steps, with no halved or surge steps.

Generation/init/wall timings rise from 11.204/1.897/386.724 s to 15.881/3.611/440.007 s; peak RSS rises from 2,008.6 to 2,498.4 MiB. The final report overlapped browser playback during initialization, then ran without this task's browser or test workloads. These single shared-machine samples do not isolate an end-to-end latency or retained-memory regression: the +53.28 s wall time and +489.8 MiB peak exceed the direct road-update cost and estimated static buffers. The local comparison records the uncertainty. The earlier full report remains preserved at `stats/history/2026-10-10T22-39-38-158Z-incremental-roads/933.json`.

The live browser check scrubbed a separately generated seed-14963991 planet with infrastructure and labels enabled: 2,127 routes at year 867, 2,413 at 967 and 3,982 at 1367. The overlay remained populated and changed with the requested date; live playback emitted two React maximum-update-depth warnings, so the visual check confirms route rendering and scrubbing but does not establish warning-free playback. Those planet-generation settings differ from the report harness, so these counts are display observations rather than an equivalent-report comparison. The browser check caught generation-buffer detachment; the final adapter uses engine-owned geography and copied settlement anchors, covered by a regression that transfers generation buffers and every journal while comparing exact paths with a control engine.

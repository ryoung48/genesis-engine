# History pipeline performance and benchmark results

Scope: `:history`.

This reference separates implementation optimizations and historical measurements from simulation rules. Workloads and caveats belong with each result; [record memory](record-memory.md) owns retained structure measurements.

Implemented on `optimize/history-pipeline`, based on `78f34d5`, in a separate worktree. The active workspace and its uncommitted changes were left untouched.

- Hierarchy queries read the existing child adjacency arrays directly, rather than allocating a child array at every visited province. Population queries reuse the same traversal and preserve summation order.
- Journal flushes skip empty events and reuse pending maps and people-log buffers. Completed transaction snapshots remain independent of those buffers.
- `gen:history` releases translated journal batches and engine notes every year. The full history record, including census keyframes, remains available.
- `report:history` retains childbirth-death timestamps needed by its current reporting window and releases journal batches annually. Events at an exact century boundary remain available for the following window.

## Measurements

Five warmed samples of 1,000 hierarchy queries over an 8,191-province binary tree took a median 301.9 ms before and 101.7 ms after: about 66% less time. This isolates traversal work; it is not an end-to-end speedup estimate.

Two baseline and two final runs used seed 14963991, lateMedieval, 20,000 points and 300 years:

| Measurement | Baseline runs | Optimized runs |
| --- | --- | --- |
| Simulation + translation | 28.22 s / 26.75 s | 25.91 s / 31.52 s |
| Frame reconstruction | 0.80 s / 0.77 s | 0.83 s / 0.98 s |
| Peak worker RSS | 374 / 382 MiB | 368 / 269 MiB |

End-to-end timing and garbage collection varied on the shared machine. These samples demonstrate lower retained-data requirements and a faster isolated hierarchy path, but do not establish a reliable overall speedup. The default 204,000-point workload was not benchmarked. JSON measurements and raw local diagnostics are in `verification/history-optimization/` in this worktree.

To repeat the generation workload in PowerShell:

```powershell
$env:HISTORY_POINTS = '20000'
$env:HISTORY_YEARS = '300'
$env:HISTORY_SEED = '14963991'
$env:HISTORY_OUT = 'history-summary.json'
pnpm gen:history
```

## Verification

All four 300-year runs produced identical yearly non-timing fields. Century and partial-century reports matched for seeds 14963991 and 42, 10,000 points and 201 years, excluding the people timing metric. A 20-year regression test compares complete records and final frames built from streamed versus retained journal batches. Other regression checks cover hierarchy order, floating-point summation order, immutable journal snapshots, empty flushes and cancelled changes.

The targeted history tests, `pnpm lint` and `pnpm typecheck` passed.

## Remaining opportunities

The CPU profile attributes substantial simulation work to repeated military deployment/alliance calculations during budget previews. Those modules overlap the other agent's active military changes, so this branch leaves them alone. Person-name generation also accounts for a substantial translation cost. A later investigation could consider generating names on demand, after defining how record consumers access them. Frame reconstruction was only around one second of the 300-year runs and is a lower-priority target.

Census keyframes and complete records still grow with history length. Lossless compression could reduce their storage while retaining every recorded value; thinning would change historical query fidelity.

The live worker and browser now release consumed journal batches, and scrub frames share their census arrays. See [Record ownership and memory](record-memory.md) for ownership rules, measurements and verification.

## People packets

People rows no longer cross the worker boundary as one object per row. Each journal transaction carries one typed-array packet whose single buffer is transferred, and the record ingests it without keeping it; see [person records](person-records.md). Every person is now recorded, so the journal carries more rows than before.

The detailed P2 row counts, packet sizes and flush/ingestion timings are in [person packet measurements](#person-packet-measurements-p2-schema). The detailed report does not structured-clone the journal, so it does not measure the saving on the worker boundary.

In the live-history harness (20,000 points, 300 years, 32,336 transactions) cloning and transferring all batches took 1.16 s and translating them 0.71 s, in a single run alongside other work.

## Lazy person names

The follow-up change defers person and house names until display code requests them through `PERSON_NAMES`. Raw people keep their name seeds, birth realms and dynasty IDs. Ruler events retain person/regent IDs and dates; revolt comments retain their structured cause and pretender ID. Wiki consumers resolve those into the same labels and text as before.

The resolver reuses the record builder's existing world-name generator, which captures the original culture context. Per-person labels are cached outside the record in a WeakMap, so raw records remain cloneable and collecting a record also releases its naming cache. Name requests return fresh person data with cached labels, so updated death dates remain visible. A frame creates only its current ruler's display view; reading a ruler's dynasty generates only the house label, while reading the ruler's name resolves and caches the person name. Repeated frame-label reads are also cached.

For seed 14963991, 20,000 points and 100 years, translating the same journal took 2,184 ms before and 366 ms afterward, about 83% less time. The run recorded 6,167 people. Before display, ruler-name requests dropped from 6,748 to zero, and dynasty-name requests from 5,627 to zero. This measures journal translation, not whole-world generation. Resolving every person's labels afterward reproduced every baseline name and house, all ruler payloads and all revolt comments. The 100 yearly generation reports also matched, excluding timings.

Tests cover deferred recording/frame construction/querying/cloning, per-person cache reuse, independent house resolution, updated person data, exact labels under reverse lookup order, Earth labels, structured revolt comments, person mentions and ruler descriptions, and a server-rendered person wiki hook. The existing family-record and streamed/batched record tests also pass. `pnpm lint` and `pnpm typecheck` pass.

Local comparison data is in `verification/history-optimization/lazy-name-measurements.json`; the naming change is based on `d505ac1`.

## Person packet measurements (P2 schema)

The following measurements describe the P2 schema (65 snapshot bytes and 81 record bytes), before households. Detailed report, seed 14963991, lateMedieval, 204,000 points, 933 years from 867 (`stats/history/2026-10-04T04-48-15-693Z-people-2-dp72/933.json`, `diagnostics.peopleRecord`). Single runs on a shared machine.

| Measure | Value |
|---|---:|
| People created and recorded | 330,956 |
| Rows | 637,416 (1.93 per person) |
| `creation` | 330,956 |
| `seat` | 152,712 |
| `wedding` | 114,976 |
| `pregnancy` | 18,350 |
| `regent` | 9,453 |
| `betrothal` | 4,761 |
| `death` | 4,193 |
| `betrothal_end` | 799 |
| Packet bytes | 37,447,540 (35.7 MiB; about 40 KB a year) |
| Journal flush, all flushes after the initial one | 6.80 s (6.00 s with object rows) |
| Record ingestion | 0.81 s (0.84 s with object rows) |

The packet bytes are exactly 25 × 637,416 + 65 × 330,956. The flush figure times the whole of `JOURNAL.flush`, not only its people rows, and the two runs' wall times differed by 9% from machine load, so neither timing shows a change. The record built from packets has the same digest (`diagnostics.peopleRecord.sha256`) as the one built from object rows.

The record's memory per structure is measured by `src/test/history-run/retained-memory.smoke.test.ts`; see [record ownership and memory](record-memory.md#people-record).

Wall times in the P2 packet comparison were 302.5 seconds with packets and 278.0 seconds with object rows; world generation was 10% slower too. This supports the machine-load caveat rather than attributing the end-to-end difference to the packet change. The detailed report excludes structured cloning across the worker boundary, so it does not measure that saving.

## Trait evaluation and birth-roll allocation

Trait consumers use `TRAITS.modifier` to sum only the requested attribute or scalar value, and `TRAITS.has` checks the packed personality slots directly. These reads preserve the personality age gates and grade contributions without constructing a full modifier object. Fertility reads these values once per eligible couple pass, after the age and living-child gates. Report samples reuse ruler attributes when the ruler is also the governor. No persistent modifier cache is added. Personality generation selects the lowest three group rolls with stable insertion, reads inherited membership from two bit masks, and reuses fixed weights and inheritance chances. Base attributes read each parent once. These allocation reductions preserve the remaining hash channels and personality tie order.

## Household benchmark and allocation improvements

Primary selection scans the sorted holdings without allocating or sorting a copy; the first seat at the highest rank supplies the lowest-ID tie break. Annual district settlement skips unheld seats before creating validation results. Marriage neighbor lists are cached only for one matching pass, during which territorial state does not change. Offline affiliation timelines reuse resolved ancestor roots within each before/after snapshot and clear the cache across territorial mutations and event batches, preserving equal-time coalescing and cycle handling.

DP9.2’s completed report is `stats/history/2026-10-04T12-36-36-387Z-people-3-dp92/933.json`; final DP9.1 is `stats/history/2026-10-04T13-39-53-052Z-people-3-dp91/933.json`, with explicit-baseline HTML comparison and README. Both use seed 14963991, lateMedieval, 204000 points, 867–1800, personality and late knowledge 2.366478320318625, standard diagnostics without profiling.

People created changed 326784→291832; crown successions 13350→13960; multiple-crown observations 18599→19128. Final coverage contains 196059 residence rows and 329763 unmoved realm changes. Household behavior alters marriage composition, births and the shared random stream; no small-shift expectation was supported. Holdings corrections during the residence stage also affect attribution, as described in the report README.

Mean of ten window people times changed 24.677→35.356 ms/year; wall 399.859→513.462 seconds; peak RSS 2814.758→3091.883 MiB. Offline residence reporting took 24.797 seconds separately. These single runs on a shared machine show a substantial overhead and cannot precisely separate algorithm cost, different workload and contention. The expected directions were increased retention and execution time, with no supported magnitude. See [memory measurements](record-memory.md#household-retention-measurement) for structure costs.

The performance follow-up, `stats/history/2026-10-04T14-06-53-796Z-people-3-quick-wins/933.json`, compares explicitly against final DP9.1 with the same configuration through `pnpm report:history`. The allocation and traversal changes above reduced mean people time 35.356→19.828 ms/year (-43.9%), wall time 513.462→314.261 seconds (-38.8%) and offline residence reporting 24.797→14.580 seconds (-41.2%). Peak RSS was effectively unchanged, 3091.883→3102.508 MiB (+0.3%). All ten windows' behavioral fields, household totals and the people-record digest match exactly. The adjacent README and `quick-wins-comparison.json` record verification and comparison scope. This is a single shared-machine comparison; it does not isolate individual optimizations or establish a repeatable speedup guarantee.

## Health and lifecycle benchmark (P4)

Detailed report, seed 14963991, lateMedieval, 204000 points, 933 years from 867 (`stats/history/2026-10-04T16-53-40-598Z-people-4-dp4/933.json`); single runs on a shared machine.

| Measure | Value |
|---|---:|
| Deaths: natural / childbirth / battle / heart | 258215 / 3801 / 123 / 0 |
| Adult age at death, median, men / women | 60 / 63 |
| Children delivered who reach 16 | 0.745-0.760 per century |
| Ever Incapable / ever Blind, of those dying after 50 | 6.0% / 1.1% |
| Incapacity regencies | 528 of 13325 successions |
| Field-battle sides led in person / leaders killed | 44229 / 123 |
| `health_band` / `condition` rows | 203527 / 453841 |
| Yearly health pass | 9.0 ms a year, of a 29.2 ms people pass (`stats/history/2026-10-04T17-56-24-332Z-people-4-perf/933.json`, same statistics; 16.7 of 40.5 before the performance follow-up) |

Retained structure measurements are in [record memory](record-memory.md#health-and-lifecycle-retention-p4).

## Opinion in politics benchmark (P7)

Detailed reports, seed 14963991, lateMedieval, 204000 points, 933 years from 867; single runs on a shared machine. P6 is `stats/history/2026-10-04T23-37-23-729Z-kinship-depth-4/933.json`; the three P7 steps are `2026-10-05T00-04-02-114Z-people-7-memory`, `2026-10-05T00-17-52-635Z-people-7-loyalty` and `2026-10-05T00-28-51-114Z-people-7-diplomacy`. Each folder's README compares statistics apart from timing.

The three opinion consumers time themselves inside the code they measure (`peopleOpinionCost` in each report window). For the final step:

| Component | Calls per simulated year | ms per simulated year |
|---|---:|---:|
| Diplomatic drift bias: two directed opinions per call | 148–230 | 2.4–4.8 |
| Rebellion loyalty: one directed opinion per strength test | 68–99 | 1.0–1.6 |
| Memory pruning: one scan of the live entries | 1 scan of 100–240 entries | 0.11–0.24 |

That is 4–7 ms of an annual tick averaging 358 ms. A drift call costs about 20 µs and a loyalty test about 15 µs: each opinion builds both people's contexts from live state, scores trait compatibility and checks close kinship. Drift and rebellion build a fresh context at each event and cache nothing, so a regency or succession earlier in the same instant is always seen; only the marriage market keeps a per-pass person cache, cleared on its existing refresh. Person contexts built rise from 88,000–136,000 per century with the marriage market alone to 168,000–244,000 with both political consumers.

| Whole run | P6 | Memories | Loyalty | Diplomacy |
|---|---:|---:|---:|---:|
| Wall time (s) | 417.5 | 466.5 | 465.3 | 416.5 |
| Summed annual ticks (s) | 338.3 | 371.2 | 371.8 | 334.2 |
| People created | 312,018 | 312,018 | 316,070 | 306,287 |

Whole-run time does not isolate the cost. The memories step simulates exactly the P6 history and still ran 10% slower, alongside lint and typecheck, with unchanged world generation 15% slower in the same run; the diplomacy step ran alone on a smaller population and matched P6. The component timers above are the supported figures. Retained sizes are in [record memory](record-memory.md#opinion-memory-retention-p7).

## Outcome-neutral people and transport optimisations

Four changes that leave every simulation statistic and the people-record digest unchanged:

- **Trait compatibility.** `TRAITS.compatibility` looks each trait's opposing group up in a table built once, instead of searching the groups for every pair of traits.
- **Marriage-market groups.** After an accepted pair, only the couple and their children who moved are regrouped; everyone is regrouped only when the match founded a union. See [marriage and alliances](../people/marriage-and-alliances.md).
- **One buffer per people packet.** A packet's twenty columns are views on one buffer, so a transaction transfers one buffer for its people rows instead of twenty.
- **Pooled residence history.** See [record memory](record-memory.md#pooled-residence-history).

Detailed report, seed 14963991, lateMedieval, 204000 points, 933 years from 867, late-knowledge threshold 2.366478320318625, against `stats/history/2026-10-05T00-28-51-114Z-people-7-diplomacy/933.json`. Single runs on a shared machine.

| Measure | Before | After |
|---|---:|---:|
| Wall time (s) | 416.5 | 375.8 |
| People pass, ms per simulated year, range over the ten windows | 77–96 | 61–74 |
| Foreign marriage scoring, first window (s) | 1.62 | 1.00 |
| People created | 306,287 | 306,287 |
| People-record digest | `15de9cd8…` | `15de9cd8…` |

Every per-window statistic matches. The fields that differ are timers and serialized-size measurements; the saved baseline was produced from a working tree just before the P7 commit, and unmodified P7 code already differs from it on the opinion-memory size fields.

Live-history harness (20,000 points, 300 years), unmodified P7 against the four changes:

| Measure | Before | After |
|---|---:|---:|
| Simulation, transfer and translation (s) | 27.2 | 19.7 |
| Simulation ticks (s) | 22.0 | 17.4 |
| Cloning across the worker boundary (s) | 4.3 | 1.6 |
| Retained JavaScript heap (MiB) | 149 | 143 |

The report, its comparison page and both harness files are in `stats/history/2026-10-05T03-39-58-023Z-p7-exact-optimisations/`.

## District derivation timer

The detailed history report wraps `DEJURE.deriveParents` for the run and restores it afterward. `districts.deriveMs` and `districts.deriveCalls` measure title lookups and the two adjacency walks per reporting window; `districtsTotal` records the run totals. The HTML comparison places derivation milliseconds under Performance, separately from district counts and simulation statistics. The timer does not require profiling.

For seed 14963991, lateMedieval, 204,000 points, 867–1800, the completed district-tiers report measured 2,666.75 ms in 52,585 derivations (2.86 ms per simulated year, 0.74% of annual tick time). The people pass measured 82.8–124.4 ms/year by window, with a duration-weighted mean of 103.10 ms/year, compared with 58.69 ms/year in the district-cadet baseline. Average tick time rose from 298.43 to 384.23 ms (+28.8%), wall time from 347.52 to 437.47 s (+25.9%), and peak RSS from 2,219.99 to 2,842.07 MiB (+28.0%).

The final report, comparison and discussion are in `stats/history/2026-10-05T23-41-24-810Z-district-tiers/`; the exact baseline is `stats/history/2026-10-05T04-09-26-764Z-district-cadets/933.json`. Both are standard detailed reports without profiling, with late-knowledge threshold 2.366478320318625. The final 10-year preflight had 843 held districts, below the plan’s 1,332 decision point. The full run creates 2.2% more people, which does not by itself explain the 75.7% people-pass increase or the RSS difference. Additional district work and title-share allocation during inheritance projection are included in that pass. The follow-up below uses the projection timer and a worker CPU profile to investigate the increase. The small derivation share rules out the adjacency walks as the sole cause of the slowdown. These are single samples on a shared machine; the final run had no concurrent smoke-test run from this task.

## District inheritance projection

The follow-up investigation compares against the completed `stats/history/2026-10-05T23-41-24-810Z-district-tiers/933.json` report. Projection grew from 9.44 seconds in 1,039 refreshes in the district-cadet report to 42.24 seconds in 1,063 refreshes after district tiers. That 32.79-second difference accounts for about 79% of the 41.44-second increase in the people pass across those runs; the simulation trajectories also differ, so this is timer attribution rather than proof that workload differences contribute nothing.

A worker CPU profile of the same 204,000-point seed over 100 years identified `PARTITION_TITLES.allocate` as the largest function by self sampled CPU, 3,549 ms self and 3,928 ms inclusive across callers. It scanned and allocated an array of the full world title registry for each realm evaluated by yearly inheritance projection. The raw profile and analysis are in `stats/profiles/2026-10-05T23-59-30-638Z-district-tiers-worker/`. Profiled slices are diagnostic and do not replace the saved full benchmark.

Allocation now discovers held top-tier titles from the realm root and its direct children, since all top-tier seats are crown seats in the derived tree. It skips realms without junior heirs, district selection after title shares satisfy every junior, and title-population ordering without a surplus title. The same children array supplies title supporters. These changes avoid global scans and temporary allocations without introducing an index that needs invalidation or changing share ordering.

The equivalent completed after report is `stats/history/2026-10-06T00-12-13-324Z-district-tiers-speed/933.json`, with its comparison and behavior check beside it. Projection falls from 42.24 to 6.73 s (−84.1%) across the same 1,063 refreshes. The people pass falls from 103.10 to 57.79 ms/year (−43.9%), average ticks from 384.23 to 302.57 ms (−21.3%), wall time from 437.47 to 353.63 s (−19.2%), and peak RSS from 2,842.07 to 2,347.92 MiB (−17.4%). All non-performance window fields and the checked event digests, annual snapshots and run totals match exactly; V8-serialized live-memory byte estimates are performance data and can vary. The run had no concurrent smoke-test run from this task. Lint, type checking and all 309 history smoke tests pass.

Compared with the older district-cadet workload, average ticks are now only 1.4% higher and the people pass is 1.5% lower, despite the intentionally changed district behavior. These remain single samples on a shared machine. Follow-up candidates are military reconciliation and hierarchy/adjacency invalidation, followed by allocation and retained-heap profiling; inclusive CPU stack times overlap, and the next priority should come from an after profile rather than summing those times.

The after worker profile in `stats/profiles/2026-10-06T00-19-20-267Z-district-tiers-speed-worker/` confirms that title allocation drops from 3,549 to 13.6 ms self CPU in the same 100-year diagnostic. Within 28.84 sampled simulation seconds, military reconciliation takes 4.35 s inclusive, hierarchy rebuilding 1.17 s self and nation-adjacency rebuilding 1.19 s self. These are the next measured candidates: examine reconciliation batching, intermediate hierarchy reconstruction and adjacency-cache invalidations while preserving ownership and conservation boundaries. Their inclusive stacks overlap, so they are not additive speedup estimates. Heap profiling is needed before attributing the RSS change to a particular retained structure.


## Distribution history calibration (2026-10-10)

The original [Pipe 3](history-pipelines.md) calibration ran while this political producer was opt-in. The completed original-mechanism report is `stats/history/2026-10-09T23-54-37-668Z-distribution-history-pre-default/2023.json`, lateMedieval, 204,000 requested points, seeds 14963991/42/12345, AD 2–2025 (2,023 transitions), knowledge metadata 2.366478320318625, standard diagnostics and no profiling. The eligible graph sizes differ by seed. Placement is shared generation work; the engine separately repeats pure target projection while indexing the placed countries. PMF/projection planning is additional work, rather than detailed-engine initialization.

| Seed | Eligible provinces | Generation | Engine initialization | Annual advancement total | Annual frame folding total | Record JSON |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 14963991 | 10,944 | 12.62 s | 2.21 s | 105.03 s | 114.16 s | 47.22 MiB |
| 42 | 11,183 | 16.84 s | 3.15 s | 163.95 s | 133.89 s | 46.61 MiB |
| 12345 | 12,370 | 13.75 s | 2.37 s | 154.82 s | 125.55 s | 51.90 MiB |

These are single samples on a shared machine, overlapping other calibration and verification. Frame timing reconstructs a date every year and grows with cumulative political events; it is not constant-time scrubbing. JSON size is serialized record cost, not an isolated retained-heap measurement. The additional engine initialization takes about 2–3 seconds here and is materially larger than the hoped-for small indexing overhead. Annual projection, articulation work, writing and ingestion are exposed separately in subsequent diagnostics.

The equivalent Pipe 2 preservation report is `stats/history/2026-10-09T23-57-16-382Z-distribution-history-preserve-pipe2/933.json`, compared to `stats/history/2026-10-09T04-56-54-635Z-parent-weddings-always-recorded/933.json`. Existing behavioral statistics and event digests match. Pipeline metadata and source provenance changed intentionally; timing/memory differences are separated. Old reports lacking pipeline metadata are explicitly inferred as simulation.

The overlapping Pipe 3 workload is `stats/history/2026-10-10T00-09-25-029Z-distribution-history-overlap/933.json`: the same seed/points/era, AD 867–1800, with AD 2–867 warm-up separately measured at 51.80 seconds. Measured-window advancement totaled 58.94 seconds and annual frame folding 63.08 seconds. The saved Pipe 2 baseline's annual ticks totaled 304.85 seconds. These are different mechanisms and diagnostics; concurrent verification and their different retained records prevent treating that ratio as a controlled speedup. Shared generation remains of similar order, while the political advancement is directionally cheaper. No equivalent pre-change Pipe 3 baseline exists.

The original calibration conserved all annual ownership, connectivity and capital invariants, but failed trajectory acceptance: AD 1914 relative count error was 0.899/1.023/1.077; modern country-share TV was 0.198/0.237/0.251. A doubled 4% capture-budget trial and ordinal-order initialization were tested and rejected; original 2% capture and largest-first placement remain. At that stage the application default remained detailed history. See [distribution rules](../politics/distribution-history.md) for the fixed target gate; estimates are not acceptance criteria.


Final original-mechanism validation also completed at `stats/history/2026-10-10T00-24-22-568Z-distribution-history-final-original-mechanism/2023.json`. Every recorded annual political field and serialized record byte count matches the original large calibration; all added identity/war lifecycle counters are zero. These final reports fold frames at 20-year transport boundaries plus the six checkpoints and endpoint, rather than at every year. They record the observation years and cadence explicitly, and comparison flags this diagnostic workload difference. The lower frame-work total must not be interpreted as a faster frame reader. That original-mechanism run did not pass the fixed trajectory gate.

## Passing large-world steering repair

The completed final report is `stats/history/2026-10-10T01-20-34-437Z-distribution-history-final/2023.json`: distribution, 204,000 requested points, seeds 14963991/42/12345, lateMedieval, AD 2–2025, knowledge threshold 2.366478320318625, standard diagnostics and no profiling. All six checkpoints on every seed pass the unchanged country TV ≤0.10, province-mass TV ≤0.15 and relative count error ≤0.25 gate; all annual ownership/connectivity/capital/lifecycle violations are zero. Fast history is now the application default.

| Seed | Generation | Engine initialization | Annual advancement | Median year | Report wall | Record JSON |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 14963991 | 19.44 s | 5.21 s | 86.97 s | 36.63 ms | 135.33 s | 65.89 MiB |
| 42 | 14.04 s | 2.57 s | 71.12 s | 33.64 ms | 104.66 s | 66.26 MiB |
| 12345 | 14.55 s | 2.51 s | 79.10 s | 37.75 ms | 115.01 s | 72.99 MiB |

These are single shared-machine samples; the first seed overlapped smoke tests. Report wall includes independent validation and frame reconstruction, and excludes the subsequent HTML comparison. Advancement includes yearly target planning, ownership mutations and record writing/ingestion. Remaining projection cost is 17.28/27.71/27.37 seconds, respectively. The passing mechanism has more political turnover and larger records than the failed original mechanism, so its timing change is not an isolated algorithm speedup.

The CPU diagnostic at `stats/profiles/2026-10-10T01-08-01-109Z-distribution-steering-worker/worker.cpuprofile` sampled the actual worker on the same 204,000-point seed for 200 years. Attack declarations account for 6.15 of 9.47 seconds sampled inside annual advancement; frontier checks account for 3.93 seconds inclusive. These overlap and must not be added. The report comparison scan also consumes sampled CPU, but is outside simulation advancement and browser playback. Profiled slices remain diagnostic.

Performance work removes repeated world-histogram construction per country, stops feasibility queries at the first legal frontier, scores identical successor histograms once, and materializes only the accepted connected cut. Against `stats/history/2026-10-10T01-14-07-882Z-distribution-history-reachable-steering/2023.json`, final annual political report fields and record byte counts match exactly; only connectivity timing is excluded from that field equality. The final scoring cache alone gives little measurable improvement in these noisy samples. See the report's `calibration-gate.md` and generated `2023-diff.html`; all reports remain local and previous reports are preserved.

The separate headless Chromium check at 204,000 points, seed 42, measured **41.62 seconds** from Generate to the ready world, including display setup, and **112.03 seconds** from timeline start through 2025, including a brief pause/resume check. All six historical checkpoints scrubbed correctly and no page errors occurred. This UI sample ran after the benchmark and smoke suite completed. It includes worker scheduling, transport, main-thread record ingestion, frame reconstruction and rendering, so it is distinct from the Node advancement timer. Results are saved in `stats/distribution-ui-big-check.json`.

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

People rows no longer cross the worker boundary as one object per row. Each journal transaction carries one typed-array packet whose buffers are transferred, and the record ingests it without keeping it; see [person records](person-records.md). Every person is now recorded, so the journal carries more rows than before.

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
| `stress` | 1,216 |
| `betrothal_end` | 799 |
| Packet bytes | 37,447,540 (35.7 MiB; about 40 KB a year) |
| Journal flush, all flushes after the initial one | 6.80 s (6.00 s with object rows) |
| Record ingestion | 0.81 s (0.84 s with object rows) |

The packet bytes are exactly 25 × 637,416 + 65 × 330,956. The flush figure times the whole of `JOURNAL.flush`, not only its people rows, and the two runs' wall times differed by 9% from machine load, so neither timing shows a change. The record built from packets has the same digest (`diagnostics.peopleRecord.sha256`) as the one built from object rows.

The record's memory per structure is measured by `src/test/history-run/retained-memory.smoke.test.ts`; see [record ownership and memory](record-memory.md#people-record).

Wall times in the P2 packet comparison were 302.5 seconds with packets and 278.0 seconds with object rows; world generation was 10% slower too. This supports the machine-load caveat rather than attributing the end-to-end difference to the packet change. The detailed report excludes structured cloning across the worker boundary, so it does not measure that saving.

## Trait evaluation and birth-roll allocation

Trait consumers use `TRAITS.modifier` to sum only the requested attribute or scalar value, and `TRAITS.has` checks the packed personality slots directly. These reads preserve the personality age gates and grade contributions without constructing a full modifier object. Fertility reads these values once per eligible couple pass, after the age and living-child gates. Report samples reuse ruler attributes when the ruler is also the governor. No persistent modifier cache is added. Personality generation selects the lowest three group rolls with stable insertion, reads inherited membership from two bit masks, and reuses fixed weights and inheritance chances. Base attributes read each parent once. A zero-stress person with no current stressors or bereavement skips trait-factor evaluation. These allocation reductions preserve the remaining hash channels and personality tie order.

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

# History record ownership and memory usage

Scope: `:history`.

This reference covers buffer ownership, retained data and memory measurements. [Pipeline performance](pipeline-performance.md) owns optimization timing comparisons.

The history record remains the complete source for scrubbing. Events, census dates and numeric values are retained at their existing precision. These changes reduce temporary and duplicate storage; they do not compress, thin or replay historical data.

## Ownership

- The simulation worker posts the pending journal, then calls `JOURNAL.releaseSent` after `postMessage` succeeds. Sent transactions and engine notes can then be collected. Census buffer transfers still move ownership to the receiver.
- The procedural timeline treats its journal ref as a pending queue. `SIM_RECORD.consumeJournal` translates the whole queue into the record, then empties it. Later batches append to that empty queue. The non-consuming `appendJournal` operation remains available for consumers comparing or inspecting batches.
- Frame population and development arrays reference the selected census snapshot directly. Census snapshots and those frame arrays must be treated as immutable. The engine copies its current arrays when recording a census, so later simulation updates do not change earlier frames. Political arrays and other reconstructed frame state retain their existing ownership.
- Rulers arrive inside the journal transaction as plain numbers: each ruler change carries the ruler's naming inputs (id, name seed, name origin, sex, dynasty, dynasty origin), and notes that name replaced rulers carry the same snapshots. The record keeps them in the nation event payloads; names resolve lazily and are never stored. See [rulers and dynasties](../politics/rulers-and-dynasties.md#records-and-names).
- The roads adapter shares the engine's owned geography buffers and retains copies of the three settlement-anchor arrays; it never retains the generation buffers that transfer to the UI.
- Roads arrive as packed added/released paths in changed journal batches. Translation retains each added path once in a lifetime log, plus an active-entry map; release packets are discarded with their transactions. Frames reference retained paths. Engine batch summaries keep counts and timings without retaining released paths. Report fields `roads.routeLogEntries` and `roads.pathRegions` measure lifetime entries and path elements (four bytes per element in transport; JavaScript arrays in the record have additional overhead). See [road network](road-network.md).
- The existing frame cache still retains up to 48 dates. No decompression or additional history replay is introduced.

## Measurements

The live-history harness uses seed 14963991, lateMedieval, 20,000 points, 2,377 provinces, 300 years and 48 cached scrub dates. It reproduces worker structured cloning and census-buffer transfers, browser journal translation and frame reconstruction in one Node process. Memory is sampled after an explicit garbage collection; it is not a measurement of an interactive browser session.

An actual before-change run and the first after-change run produced:

| Metric | Before | After |
| --- | ---: | ---: |
| Retained JavaScript heap | 314.19 MiB | 129.35 MiB |
| Process RSS | 977.60 MiB | 759.90 MiB |
| Retained worker transactions | 34,121 | 0 |
| Retained worker notes | 73,343 | 0 |
| Retained browser transactions | 34,121 | 0 |
| Extra census arrays in cached frames | 1.31 MiB | 0 |
| Recorded censuses | 301 | 301 |

The complete record and serialized scrub-frame hashes matched exactly. Retained heap fell by about 59%; allocator behavior makes RSS a less direct measure of retained data. The first timing samples overlapped unrelated verification work and do not establish a latency change.

Three alternating retained/released timing pairs then ran without other verification commands overlapping them. The retained mode reproduces the former journal retention and census copies; the released mode uses the new APIs. All six record and scrub hashes matched the actual before-change run.

| Metric | Retained mode | Released mode |
| --- | ---: | ---: |
| Median simulation, transfer and translation | 17.32 s | 17.88 s |
| Range across three runs | 15.60–19.60 s | 15.20–18.37 s |
| Median reconstruction of 48 scrub frames | 337.00 ms | 335.13 ms |
| Median reconstruction per frame | 7.02 ms | 6.98 ms |
| Scrub reconstruction range | 300.94–372.89 ms | 301.79–347.15 ms |

The scrub median is essentially unchanged (-0.6%). The simulation/transfer/translation median is 3.2% higher, but individual pairs include both increases and decreases and their ranges overlap substantially. These samples do not establish a consistent latency regression or support a guarantee of zero penalty. They do confirm that every recorded value remains available without adding decompression or replay.

Local measurements are in `stats/history/2026-10-03T20-58-05-000Z-scrub-memory-measurements/`. Reports and comparisons stay local and are not committed.

## Verification

`src/test/history-run/pipeline-optimization.smoke.test.ts` transfers census buffers, releases worker batches, consumes browser queues and compares the complete streamed record with a retained-batch record across 20 years. It checks frames at census dates and between censuses in reverse order, and checks that all three frame arrays reference the correct census snapshot.

The optional `src/test/history-run/retained-memory.smoke.test.ts` harness (204,000 points, 300 years) records memory at the start and end of the run, the ruler state's size, simulation/translation timing, scrub reconstruction timing and hashes. `HISTORY_MEMORY_RETAIN=1` reproduces the former retained-journal behavior and adds back the former census copies for timing comparisons; it is confined to the measurement harness. Scrub timing excludes hash serialization.

The harness hashes JSON values with explicit map entries and non-finite/negative-zero number representations, so sharing an empty array does not change the result hash. `hashFormat: "value-json-v1"` marks these hashes; they cannot be compared directly with the initial V8 serialization hashes. Memory is collected after yielding to the event loop, releasing temporary hash serialization strings before GC. The `gcAfterYield` flag distinguishes these samples from earlier exploratory measurements.

```powershell
$env:HISTORY_MEMORY_OUT = 'stats/history/<run-start-timestamp>-scrub-memory/after.json'
pnpm exec vitest run --project smoke src/test/history-run/retained-memory.smoke.test.ts
```

The required detailed-report baseline is `stats/history/2026-10-03T20-06-52-591Z-full-benchmark/933.json`: seed 14963991, lateMedieval, 204,000 requested points, start year 867, 933 years and late-knowledge threshold 2.366478320318625, with the runner's standard diagnostics and no profiling. Its equivalent after-change report uses:

```powershell
$env:HISTORY_SEEDS = '14963991'
$env:HISTORY_ERA = 'lateMedieval'
$env:HISTORY_POINTS = '204000'
$env:HISTORY_START = '867'
$env:HISTORY_YEARS = '933'
$env:HISTORY_LATE_KNOWLEDGE = '2.366478320318625'
$env:HISTORY_BASELINE = 'stats/history/2026-10-03T20-06-52-591Z-full-benchmark/933.json'
$env:HISTORY_TITLE = 'scrub-history-memory'
Remove-Item Env:HISTORY_OUT -ErrorAction SilentlyContinue
pnpm report:history
```

The completed after-change report is `stats/history/2026-10-03T21-02-00-462Z-scrub-history-memory/933.json`, with `933-diff.html` beside it. The comparison found zero changed, added or removed simulation-statistic or diagnostic values. Wall time was 257.60 seconds versus 254.06 seconds before (+1.4%); peak RSS was 2,899.07 MiB versus 2,755.32 MiB (+5.2%). These are single runs on a shared machine.

The detailed-report runner already releases journals and does not build the browser scrub record, so its timing and memory do not measure the live-path savings. It verifies simulation statistics independently of the live-memory experiment.

## Ruler-only measurement

The retained-memory harness runs 300 years on the 204,000-point world and collects garbage before each reading. Against the commit before the ruler-only change, both runs started at the same size (about 1.1 GiB of heap plus array buffers, almost all of it the generated world). After 300 years the retained heap was 217 MiB instead of 365 MiB (a 148 MiB saving, 41% of the heap, 13% of everything retained) while array buffers were unchanged at about 700 MiB, because the census columns are the same. Heap growth since the start fell from 280 to 141 MiB.

The 933-year report's peak RSS fell by only 4.3% (2,467 to 2,361 MiB) because most of the peak is the world, which the change does not touch, plus transient allocations. RSS after a collection varied by hundreds of MiB between identical runs and is not a usable comparison; heap used plus array buffers is.

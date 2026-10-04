# History pipeline performance

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

The live worker and browser now release consumed journal batches, and scrub frames share their census arrays. See [History record memory](history-record-memory.md) for ownership rules, measurements and verification.
## People packets

People rows no longer cross the worker boundary as one object per row. Each journal transaction carries one typed-array packet whose buffers are transferred, and the record ingests it without keeping it; see [people records](people-records.md). Every person is now recorded, so the journal carries more rows than before.

In the detailed report (seed 14963991, lateMedieval, 204,000 points, 933 years) the journal carried 637,416 people rows for 330,956 people in 35.7 MiB of packets. Summed over the run, `JOURNAL.flush` took 6.80 s with packets and 6.00 s with object rows carrying the same rows, and folding the rows into a people record took 0.81 s against 0.84 s. The two runs' wall times differed by 9% from machine load (302.5 s and 278.0 s, with world generation 10% slower too), so these single samples show no change in either direction. The flush figure covers the whole flush, not only its people rows, and excludes the initial flush. The detailed report does not structured-clone the journal, so it does not measure the saving on the worker boundary.

In the live-history harness (20,000 points, 300 years, 32,336 transactions) cloning and transferring all batches took 1.16 s and translating them 0.71 s, in a single run alongside other work.

## Lazy person names

The follow-up change defers person and house names until display code requests them through `PERSON_NAMES`. Raw people keep their name seeds, birth realms and dynasty IDs. Ruler events retain person/regent IDs and dates; revolt comments retain their structured cause and pretender ID. Wiki consumers resolve those into the same labels and text as before.

The resolver reuses the record builder's existing world-name generator, which captures the original culture context. Per-person labels are cached outside the record in a WeakMap, so raw records remain cloneable and collecting a record also releases its naming cache. Name requests return fresh person data with cached labels, so updated death dates remain visible. A frame creates only its current ruler's display view; reading a ruler's dynasty generates only the house label, while reading the ruler's name resolves and caches the person name. Repeated frame-label reads are also cached.

For seed 14963991, 20,000 points and 100 years, translating the same journal took 2,184 ms before and 366 ms afterward, about 83% less time. The run recorded 6,167 people. Before display, ruler-name requests dropped from 6,748 to zero, and dynasty-name requests from 5,627 to zero. This measures journal translation, not whole-world generation. Resolving every person's labels afterward reproduced every baseline name and house, all ruler payloads and all revolt comments. The 100 yearly generation reports also matched, excluding timings.

Tests cover deferred recording/frame construction/querying/cloning, per-person cache reuse, independent house resolution, updated person data, exact labels under reverse lookup order, Earth labels, structured revolt comments, person mentions and ruler descriptions, and a server-rendered person wiki hook. The existing family-record and streamed/batched record tests also pass. `pnpm lint` and `pnpm typecheck` pass.

Local comparison data is in `verification/history-optimization/lazy-name-measurements.json`; the naming change is based on `d505ac1`.

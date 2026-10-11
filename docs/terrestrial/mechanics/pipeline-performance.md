# History pipeline performance and benchmark results

Scope: `:history`.

This reference separates implementation optimizations and historical measurements from simulation rules. Workloads and caveats belong with each result; [record memory](record-memory.md) owns retained structure measurements.

Implemented on `optimize/history-pipeline`, based on `78f34d5`, in a separate worktree. The active workspace and its uncommitted changes were left untouched.

- Hierarchy queries read the existing child adjacency arrays directly, rather than allocating a child array at every visited province. Population queries reuse the same traversal and preserve summation order.
- Journal flushes skip empty events and reuse pending maps. Completed transaction snapshots remain independent of those buffers.
- `gen:history` releases translated journal batches and engine notes every year. The full history record, including census keyframes, remains available.
- `report:history` releases journal batches annually. Events at an exact century boundary remain available for the following window.

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

## Routes stage

Route computation (land and sea routes plus the network) is the final world-generation stage, timed under Generation / Infrastructure / `routes`, with detailed child measurements. See [generation timing and estimated progress](../../development/generation-timing.md) for the profile hierarchy and browser cache. Measured at 204,000 points: 728.8 ms on seed 14963991, about 2.8% of the 25.8 s generation baseline (`stats/history/2026-10-10T19-42-27-900Z-large-states-water-neutral/933.json`); 1,276 ms on seed 42 under machine load. See `route-search-performance.md`.

History repeats the route build at initialization, then advances it every ten years after the census population pass. The 204,000-point, seed 14963991, 30-year slice measured a 522 ms initial routing batch and 379 ms across three subsequent batches (maximum 164 ms), with static preprocessing additionally included in engine initialization. Sea-neighbour discovery dominates batch cost. See [road network](road-network.md) for the workload, retained state, final full-horizon comparison and timing caveats.

The final completed equivalent 933-year report is `stats/history/2026-10-10T22-58-38-015Z-incremental-roads-final/933.json`, compared with `stats/history/2026-10-10T21-03-19-980Z-single-urban-model/933.json`. Every existing behavioral field matches. The 93 subsequent road batches total 15.609 s, maximum 320.1 ms; final routes number 12,955. Overall generation/init/wall time is 15.881/3.611/440.007 s versus 11.204/1.897/386.724 s; peak RSS is 2,498.4 MiB versus 2,008.6 MiB. Browser playback overlapped initialization, then the report ran without this task's browser or test workloads. These single shared-machine samples do not isolate overall latency or retained-memory regressions. The local `comparison.md` separates measured road work from that uncertainty.

## Verification

All four 300-year runs produced identical yearly non-timing fields. Century and partial-century reports matched for seeds 14963991 and 42, 10,000 points and 201 years. A 20-year regression test compares complete records and final frames built from streamed versus retained journal batches. Other regression checks cover hierarchy order, floating-point summation order, immutable journal snapshots, empty flushes and cancelled changes.

The targeted history tests, `pnpm lint` and `pnpm typecheck` passed.

## Remaining opportunities

The CPU profile attributes substantial simulation work to repeated military deployment/alliance calculations during budget previews. Those modules overlap the other agent's active military changes, so this branch leaves them alone.

Census keyframes and complete records still grow with history length. Lossless compression could reduce their storage while retaining every recorded value; thinning would change historical query fidelity.

The live worker and browser now release consumed journal batches, and scrub frames share their census arrays. See [Record ownership and memory](record-memory.md) for ownership rules, measurements and verification.

## District derivation timer

The detailed history report wraps `DEJURE.deriveParents` for the run and restores it afterward. `districts.deriveMs` and `districts.deriveCalls` measure title lookups and the two adjacency walks per reporting window; `districtsTotal` records the run totals. The HTML comparison places derivation milliseconds under Performance, separately from district counts and simulation statistics. The timer does not require profiling.

For seed 14963991, lateMedieval, 204,000 points, 867–1800, the completed district-tiers report measured 2,666.75 ms in 52,585 derivations (2.86 ms per simulated year, 0.74% of annual tick time). The people pass measured 82.8–124.4 ms/year by window, with a duration-weighted mean of 103.10 ms/year, compared with 58.69 ms/year in the district-cadet baseline. Average tick time rose from 298.43 to 384.23 ms (+28.8%), wall time from 347.52 to 437.47 s (+25.9%), and peak RSS from 2,219.99 to 2,842.07 MiB (+28.0%).

The final report, comparison and discussion are in `stats/history/2026-10-05T23-41-24-810Z-district-tiers/`; the exact baseline is `stats/history/2026-10-05T04-09-26-764Z-district-cadets/933.json`. Both are standard detailed reports without profiling, with late-knowledge threshold 2.366478320318625. The final 10-year preflight had 843 held districts, below the plan’s 1,332 decision point. The full run creates 2.2% more people, which does not by itself explain the 75.7% people-pass increase or the RSS difference. Additional district work and title-share allocation during inheritance projection are included in that pass. The follow-up below uses the projection timer and a worker CPU profile to investigate the increase. The small derivation share rules out the adjacency walks as the sole cause of the slowdown. These are single samples on a shared machine; the final run had no concurrent smoke-test run from this task.

## Knowledge spin-up

`KNOWLEDGE.initKnowledge` runs the yearly knowledge rule in ten-year steps from the preceding era's baseline until the world mean reaches the start baseline. The rule lives in one private `step` over plain arrays (a sovereign array filled once, no per-province `STATE.getSovereign` calls), shared with the yearly census. On the 204,000-point world with an 867 start the spin-up is about 64 steps and about 70 ms; engine initialization measured 2.8 s in a 10-year slice against 3.1 s in the interregnum baseline (`stats/history/2026-10-11T01-02-23-232Z-interregnum/933.json`).

## Ruler-only people

For seed 14963991, lateMedieval, 204,000 points, 867–1800, the completed ruler-only report is `stats/history/2026-10-11T21-43-35-790Z-ruler-only-people/933.json`, compared with `stats/history/2026-10-11T17-27-55-417Z-government-isolated-changed/933.json`. Annual ticks fell from 283.1 to 165.6 s, wall time from 362.3 to 193.4 s and peak RSS from 2,466.8 to 2,360.6 MiB (−4.3%). The sovereign count also falls over the run (315 in the first window, 84 in the last, as claim wars form unions), so part of the time saving is a smaller map. Baseline wall time varied by 14.8% between near-identical runs. The local `comparison.md` holds the full table.

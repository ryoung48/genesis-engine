# History smoke tests

Scope: `:history`.

Run related tests after each implementation step:

```powershell
pnpm test:history:related src/model/history/sim/people/health/index.ts
```

Pass every changed source file to `test:history:related`; Vitest selects test files through their imports. A change to a shared dependency can select most of the suite. For changes to test configuration, run the full suite directly.

Run the full history smoke suite once after implementation:

```powershell
pnpm test:history
```

The `history-smoke` project runs files in isolated workers, with at most eight workers and no more than the machine's available CPU parallelism. The cap bounds concurrent world generation and engine initialization. Tests within each file remain sequential, so existing module patches and mutable fixtures retain their ordering.

History generation (`gen:history`), detailed reporting (`report:history`) and the retained-memory diagnostic remain in the serial `smoke` project. They run after the parallel project when both projects are selected. Climate and celestial tests also retain their existing serial configuration. The ordinary history suite does not run the generators or benchmark.

Siege calibration keeps all 64 combinations of terrain, troop multiples, force ratios and relief forces, with 2,000 trials per scenario instead of 20,000. Its acceptance bounds are unchanged. At 2,000 trials the worst-case binomial standard error is about 1.1 percentage points (`sqrt(0.5 * 0.5 / 2000)`); the p99 estimate has less tail resolution. Set `SIEGE_CALIBRATION_OUT` to retain the full 20,000-trial measurement and write its results:

```powershell
$env:SIEGE_CALIBRATION_OUT = 'stats/siege-calibration.json'
pnpm test:history src/test/history-run/siege.smoke.test.ts
Remove-Item Env:SIEGE_CALIBRATION_OUT
```

The assertion-free twelve-variant inheritance measurement and its experimental implementation have been removed. Production inheritance tests still check valid grade states, carried sides, promotion, transmission frequencies, parent correlations and reproducible draws. They do not require every seeded character draw to match a fixed historical checksum.

Rebellion evaluation tests use neutral governor diplomacy and no Ambitious/Content effect, so their threshold and random-draw assertions depend on explicit inputs rather than traits of a generated ruler. Provincial revenue aggregation likewise uses neutral governor modifiers; real governor income and cache behavior remain covered by the traits tests. Aggregation compares a relative revenue difference rather than requiring twelve decimal places of absolute agreement across a generated realm.

To compare serial and parallel execution with the same tests:

```powershell
pnpm test:history --no-file-parallelism --reporter=json --outputFile=stats/history-smoke-serial.json
pnpm test:history --reporter=json --outputFile=stats/history-smoke-parallel.json
```

Compare elapsed run time separately from summed file durations: parallel workers contend for CPU, so individual files can take longer while the suite finishes sooner. Run each measurement without another test run competing for resources. Smoke timing files are local artifacts, separate from the detailed reports produced by `report:history`.

## Measured comparison

Single runs on October 4, 2026, on a workstation exposing 16 CPU workers, with eight smoke workers:

| Configuration | Wall time | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| Original serial suite | 667 s | 236 | 3 | 1 |
| Parallel files, original workload | 317 s | 236 | 3 | 0 |
| Parallel files, reduced siege sample, opt-in inheritance measurement | 87 s | 235 | 3 | 1 |

The serial run included the skipped retained-memory diagnostic; the parallel runs excluded it. That optimization run's skipped test was the assertion-free inheritance measurement, subsequently removed. The same two rebellion-evaluation assertions in `breakaway-armies.smoke.test.ts` and one revenue assertion in `state-maintenance.smoke.test.ts` failed with identical reported values in all three runs. Both modified files passed the related-test run (54 passed, one skipped), and lint and typecheck passed.

The final suite used about 87% less wall time than the serial baseline. These are single samples on a shared machine, and the serial baseline briefly overlapped an aborted parallel run, so the ratio is approximate. Local results are `stats/history-smoke-serial.json`, `stats/history-smoke-parallel.json`, `stats/history-smoke-trimmed.json` and `stats/history-smoke-comparison.json`. The detailed history benchmark was neither modified nor run for this test-only change.

After removing the assertion-free measurement, the experimental ladder comparison and the fixed character-draw checksum, and making governor inputs explicit in the three failing tests, the full suite passed all 236 tests across 26 files in 86 seconds, with no failures or skips. The focused related-test run passed all 30 tests; lint and typecheck passed. The completed local result is `stats/history-smoke-reviewed.json`. Production simulation and `report:history` were unchanged by this test review.


## Distribution producer

Small deterministic fixtures live in `src/test/history-run/distribution-{time,targets,territory,attacks,record}.smoke.test.ts` and `history-routing.smoke.test.ts`. They check numerical projection, ownership/connectivity revisions, war/identity lifecycles, shared folding, apply-once streaming, empty completion, actual active-batch pause, cancellation and alternate batch sizes. They do not sample rates or target fidelity; those belong to detailed reports.

```powershell
pnpm test:history:related src/model/history/distribution/engine/index.ts src/model/history/distribution/territory/index.ts
pnpm test:history
pnpm lint
pnpm typecheck
$env:HISTORY_PIPELINE = 'distribution'
$env:HISTORY_START = '2'
$env:HISTORY_YEARS = '2023'
$env:HISTORY_POINTS = '204000'
$env:HISTORY_SEEDS = '14963991,42,12345'
$env:HISTORY_TITLE = 'distribution-history-pre-default'
pnpm report:history
```

Keep HISTORY_OUT unset for the standard local report folder. `gen:history` also accepts the explicit producer; distribution defaults to the complete 2–2025 span. Detailed simulation remains the default for report/baseline reproduction. Calibration now uses only 204,000-point worlds at the user’s request; preserve the equivalent Pipe 2 benchmark. Automatic comparison matching includes producer metadata; explicit cross-pipeline comparisons label the different mechanisms and omit inapplicable people/military metrics. Clear task-specific environment settings after running commands. See [history pipelines](history-pipelines.md) and the [fixed distribution acceptance gate](../politics/distribution-history.md).

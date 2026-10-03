# Full history benchmark: battle types and sieges

Completed `pnpm report:history` over 933 years, 867-1800. Seed 14963991, lateMedieval, 204000 requested points (204001 generated; 12746 provinces), late-knowledge threshold 2.366478320318625, standard detailed diagnostics, no profiling. `HISTORY_OUT` unset. Exact `HISTORY_BASELINE`: `../2026-10-03T04-16-15-521Z-scoped-military-reconcile/933.json`, the latest completed equivalent detailed report before battle types and sieges. Current recorded revision: `2b1443c`; source hash includes the uncommitted compact-JSON writer fix saved with this benchmark.

All 933 annual ticks completed. Annual military validation and siege lifecycle checks pass: 9458 starts, 9450 endings, 8 running at the horizon. `933-diff.html` contains the full comparison. `933-500.json` is a partial checkpoint and is not a completed baseline. Earlier reports are preserved.

## Encounter distribution

| Type | Count | Share |
| --- | ---: | ---: |
| Open battle | 58472 | 79.99% |
| Ambush | 4242 | 5.80% |
| River crossing | 927 | 1.27% |
| Siege start | 9458 | 12.94% |
| Total | 73099 | 100% |

Each siege counts once at its start, not once per monthly tick. The 95% siege chance applies only when the target has at least 2000 urban residents and the other siege eligibility checks pass.

## Siege outcomes and durations

Of 9450 finished sieges: surrendered 3429 (36.29%), starved out 3658 (38.71%), stormed 1485 (15.71%), betrayed 285 (3.02%), relieved 206 (2.18%), lifted 387 (4.10%). Eight remain active in 1800.

| Reporting window | Siege starts | Median phases | p90 phases | p99 phases |
| --- | ---: | ---: | ---: | ---: |
| 867-967 | 537 | 3 | 6 | 8.64 |
| 967-1067 | 795 | 2 | 5 | 8 |
| 1067-1167 | 854 | 2 | 6 | 9 |
| 1167-1267 | 834 | 2 | 5 | 9 |
| 1267-1367 | 929 | 3 | 5 | 8 |
| 1367-1467 | 1181 | 2 | 5 | 8 |
| 1467-1567 | 1183 | 3 | 5 | 9 |
| 1567-1667 | 1270 | 3 | 5 | 8 |
| 1667-1767 | 1386 | 3 | 5 | 8.16 |
| 1767-1800 | 489 | 3 | 5 | 8 |

These percentiles describe finished sieges in each reporting window, not pooled full-run percentiles. Each phase is 30 days; peace and invalidation can end sieges between ticks. Fractional percentiles come from interpolation.

## Simulation comparison

| Statistic | Before battle types/sieges | Current |
| --- | ---: | ---: |
| Field battles | 75057 | 63641 |
| Wars started | 10955 | 11364 |
| Wars completed | 10927 | 11334 |
| Battle casualties | 198.69 million | 158.96 million |
| Population in 1800 | 444.29 million | 475.84 million |
| Population-weighted knowledge in 1800 | 1.9774 | 1.9664 |

Field battles decrease 15.21% and completed wars increase 3.72%. Battle casualties exclude siege attrition and siege clashes, so their 19.99% decrease does not establish a decrease in all military casualties. Monthly siege events, delayed occupations and additional random draws change later campaigns and population trajectories; this is a seed-equivalent comparison, not identical wars with only one parameter varied.

## Full latency difference against the pre-siege baseline

The baseline is the pre-battle-types/siege report recorded at `eb6229b`, not the previous siege-probability experiment. Annual timer boundaries are equivalent in the two versions.

| Measured component | Before | Current | Delta |
| --- | ---: | ---: | ---: |
| Recorded wall time | 408.517s | 440.798s | +32.281s (+7.90%) |
| Annual simulation, validation and diagnostics | 343.742s | 375.110s | +31.368s (+9.13%) |
| World generation | 14.384s | 14.720s | +0.335s (+2.33%) |
| Engine initialization | 0.437s | 0.458s | +0.021s (+4.81%) |
| Remaining recorded work | 49.954s | 50.510s | +0.556s (+1.11%) |
| Mean annual tick | 368.426ms | 402.047ms | +33.621ms (+9.13%) |
| Median annual tick | 360.379ms | 388.877ms | +28.498ms (+7.91%) |
| p90 annual tick (nearest-rank sample) | 440.094ms | 476.691ms | +36.597ms (+8.32%) |
| Maximum annual tick | 963.245ms | 1144.971ms | +181.726ms (+18.87%) |
| Peak memory | 3224428KB | 3220124KB | -4304KB (-0.13%) |

The annual timer includes simulation, military validation, annual logistics/recruitment diagnostics and journal processing. It does not isolate siege code. Remaining recorded work is wall time minus generation, engine initialization and annual ticks; it includes checkpoint/report work and sampling outside those timer boundaries.

| Window | Before annual work | Current annual work | Delta |
| --- | ---: | ---: | ---: |
| 867-967 | 36.729s | 37.256s | +0.527s |
| 967-1067 | 37.842s | 39.596s | +1.754s |
| 1067-1167 | 34.042s | 37.552s | +3.510s |
| 1167-1267 | 35.405s | 37.230s | +1.824s |
| 1267-1367 | 36.976s | 38.838s | +1.862s |
| 1367-1467 | 36.455s | 40.254s | +3.800s |
| 1467-1567 | 36.703s | 40.144s | +3.441s |
| 1567-1667 | 38.450s | 42.151s | +3.701s |
| 1667-1767 | 38.355s | 48.931s | +10.576s |
| 1767-1800 | 12.784s | 13.156s | +0.372s |

97.2% of the wall-time increase is inside annual work. The last full century accounts for 10.576s of that increase. Added siege phase events, repeated coalition construction, troop accounting and event snapshots are plausible costs, but these unprofiled single-run measurements do not assign exclusive causal time to any function. Population and campaign workloads also differ.

The full test process took 489.03s (test body 484.18s). Recorded wall time is sampled before final serialization/write and comparison, so it is not the end-to-end command time; final output/comparison and other test-body work add about 43.38s after that sampled duration. Equivalent pre-change command duration was not retained, so no end-to-end command delta is claimed.

## Report-size fix and verification

The first attempt failed at the next checkpoint after saving through 1667 because formatted `JSON.stringify` exceeded Node's string-length limit. Compact JSON retains all fields and allowed the full 454200569-byte report to finish. The partial attempt is preserved in `../2026-10-03T15-41-42-806Z-siege-95-2k-full/`; it is not a completed baseline. Matching completed windows have identical simulation statistics between attempts, excluding timing.

`pnpm lint`, `pnpm typecheck` and the completed detailed history test pass. The automatic retention step removed the oldest report; it was copied back from the preserved original so all earlier reports remain available.

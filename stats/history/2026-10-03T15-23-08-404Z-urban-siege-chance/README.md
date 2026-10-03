# Higher urban siege chance

The user requested a large increase in siege probability at eligible urban targets while preserving ambush and river-crossing probabilities, and explicitly limited the change to siege chance. Urban threshold (5000), garrison eligibility, siege durations and outcomes are unchanged.

## Probability change

`SIEGE_OPEN_WEIGHT_TRANSFER = 0.55` transfers weight from open battle to siege, only when siege is eligible: open 0.70 -> 0.15, siege 0.15 -> 0.70. This documented modeling choice makes siege the dominant encounter at qualifying towns, without altering the total eligible weight or the ambush (0.05) and river-crossing (0.12) weights. It implements the requested strong increase rather than claiming an empirically measured historical probability.

| Eligible town | Kind | Before | After |
| --- | --- | ---: | ---: |
| No river | Open | 77.78% | 16.67% |
| No river | Ambush | 5.56% | 5.56% |
| No river | Siege | 16.67% | 77.78% |
| River | Open | 68.63% | 14.71% |
| River | Ambush | 4.90% | 4.90% |
| River | River crossing | 11.76% | 11.76% |
| River | Siege | 14.71% | 68.63% |

If population is below 5000 or the garrison/besieger eligibility check fails, the original encounter probabilities remain unchanged. Deterministic sampling tests cover both terrain cases, threshold eligibility and unchanged special-kind probabilities. Preserving per-encounter probabilities does not guarantee identical century totals: siege events change later RNG draws, occupations and wars.

## Equivalent history comparison

Completed with `pnpm report:history`; baseline is the latest completed equivalent detailed report, `../2026-10-03T15-09-02-444Z-battle-types-summary/100.json`, selected explicitly with `HISTORY_BASELINE`. Both runs: seed 14963991, lateMedieval, 204000 requested points, start 867, 100 years, late-knowledge threshold 2.366478320318625, standard detailed diagnostics, no profiling. `HISTORY_OUT` unset. `100-diff.html` contains the full comparison; previous reports are preserved.

| Encounters | Before | After | After share |
| --- | ---: | ---: | ---: |
| Open battles | 6971 | 6876 | 86.33% |
| Ambushes | 531 | 564 | 7.08% |
| River crossings | 95 | 131 | 1.64% |
| Siege starts | 114 | 394 | 4.95% |
| Total | 7711 | 7965 | 100% |

Siege starts increase **3.46 times**, from 1.48% to 4.95% of encounters. The global share remains much lower than the conditional urban-target chance because most targets do not meet siege eligibility. Both ambush and river-crossing counts increase in this run.

| Statistic | Before | After |
| --- | ---: | ---: |
| Completed sieges | 113 | 393 |
| Median siege phases | 2 | 3 |
| p90 siege phases | 6 | 5 |
| p99 siege phases | 7 | 8 |
| Completed wars | 1307 | 1393 |
| Median war years | 0.961 | 1.048 |
| p90 war years | 4.446 | 4.364 |
| War attacker win share | 74.90% | 73.37% |

The 30-day phase cadence is unchanged. Duration quantiles shift because the set of sieges and war trajectories change, not because duration rules were adjusted. Siege outcomes: surrendered 156, starved out 152, betrayed 10, stormed 61, relieved 12, lifted 2. One siege remains active at the horizon. Lifecycle checks pass (394 starts, 393 ends, one running); annual military validation passes.

Median war length increases 8.99%, while p90 decreases 1.84%. Completed wars increase 6.58% and war attacker success decreases 1.54 percentage points. These are reviewed simulation changes from shifting urban encounters and subsequent random trajectories; no distribution or duration retuning was applied.

## Timing, memory and checks

| Performance observation | Before | After |
| --- | ---: | ---: |
| Wall time | 77.17s | 65.98s |
| Generation time | 18.02s | 15.42s |
| Peak memory | 1194432KB | 1169860KB |

Single-run timing and memory observations are separate from simulation changes; they do not establish a performance gain caused by this small probability change.

Passed `pnpm lint`, `pnpm typecheck`, 5 battle-kind/shared-resolver checks, 13 battle regression tests, and the completed detailed history benchmark. Siege calibration was not rerun because this change does not alter the siege phase loop.

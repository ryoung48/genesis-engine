# Battle and siege statistics

Reporting-only update: adds `sieges.phases.p90` and prints battle kind counts and siege duration percentiles in benchmark console output. Completed with `pnpm report:history`; `100-diff.html` compares against the latest equivalent completed baseline, `../2026-10-03T13-52-03-688Z-battle-types/100.json`. All existing simulation statistics are unchanged.

Configuration: seed 14963991, era lateMedieval, 204000 requested points, start 867, duration 100 years, late-knowledge threshold 2.366478320318625, standard detailed diagnostics and no profiling. `HISTORY_OUT` unset; exact `HISTORY_BASELINE` supplied. Previous reports are preserved.

## Encounters

| Kind | Count | Share |
| --- | ---: | ---: |
| Open battle | 6971 | 90.40% |
| Ambush | 531 | 6.89% |
| River crossing | 95 | 1.23% |
| Siege start | 114 | 1.48% |
| Total | 7711 | 100% |

Shares include 7597 battles and 114 siege starts; siege ticks are not counted again. Among battles alone, ambushes are 6.99%.

## Sieges

113 completed; one still active. Completed-phase lengths: **median 2, p90 6, p99 7**, approximately 2/6/7 months at 30 days per scheduled phase. These are phase counts, not exact calendar durations; peace and invalidation can end a siege between ticks. No arithmetic mean is claimed.

| Outcome | Count | Share of completed sieges |
| --- | ---: | ---: |
| Surrendered | 54 | 47.79% |
| Starved out | 38 | 33.63% |
| Stormed | 15 | 13.27% |
| Betrayed | 1 | 0.88% |
| Relieved | 4 | 3.54% |
| Lifted | 1 | 0.88% |

Town fell: **108/113 (95.58%)**. Relieved or lifted: **5/113 (4.42%)**. Percentages are rounded independently.

## Battles and wars

Battle attacker win share: **60.04%**; weaker-side win share: **12.94%**. Results: **45.68% rout**, **30.70% normal**, **12.94% decisive**, **10.69% inconclusive**. Median attacker/defender troop loss shares: **5.28% / 9.05%**. Battle casualties: **11.67 million**, excluding siege attrition and siege clashes.

1339 wars started, 1307 completed. Completed-war length: **median 0.961 years, p90 4.446 years**. War attacker win share: **74.90%**. Aggregate battles per completed war: **5.81**, including battles in wars still active at the horizon.

## Verification and comparison

`pnpm lint`, `pnpm typecheck`, and the detailed history benchmark passed. Annual military validation and siege lifecycle checks pass (114 starts, 113 ends, one running). This change only adds report output; simulation statistics remain identical to the baseline. Timing and memory are compared separately in `100-diff.html` and should be read as single-run observations, not simulation behavior changes.

| Performance observation | Prior run | Reporting update |
| --- | ---: | ---: |
| Wall time | 62.74s | 77.17s |
| Generation time | 17.40s | 18.02s |
| Peak memory | 1200576KB | 1194432KB |

Wall time is 23.01% higher in this run; peak memory is 0.51% lower. The update adds one percentile calculation over 113 finished sieges; these observations do not establish its causal cost. The existing `people.msPerYear` timing metric also varies, while all simulation statistics match exactly.

The [implementation comparison](../2026-10-03T13-52-03-688Z-battle-types/README.md) now includes these tables, alongside the original pre-implementation comparison, calibration and performance interpretation.

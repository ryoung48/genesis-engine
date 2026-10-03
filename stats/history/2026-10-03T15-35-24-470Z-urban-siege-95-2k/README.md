# 95% siege probability and 2000 urban threshold

The user explicitly chose 95% of all encounters when siege conditions are met (allowing the other kinds to decrease at those targets), and requested lowering the urban threshold from 5000 to 2000. `SIEGE_CHANCE = 0.95` and `TOWN_URBAN_POPULATION = 2000` directly implement those requested values. Existing garrison, force, war and occupation eligibility still applies. Siege cadence and outcome rules are unchanged.

## Conditional encounter probabilities

An eligible target gets exactly 95% siege probability, whether or not it has a river. The remaining 5% preserves the relative field weights: open 0.70, ambush 0.05, river crossing 0.12 where applicable. Targets below the urban threshold or otherwise ineligible for siege retain the original field distribution.

| Eligible target | Kind | Previous probability | New probability |
| --- | --- | ---: | ---: |
| No river | Siege | 77.78% | 95.00% |
| No river | Open | 16.67% | 4.67% |
| No river | Ambush | 5.56% | 0.33% |
| River | Siege | 68.63% | 95.00% |
| River | Open | 14.71% | 4.02% |
| River | Ambush | 4.90% | 0.29% |
| River | River crossing | 11.76% | 0.69% |

The previous probabilities apply to the previous 5000-person threshold. The new threshold also admits towns with 2000-4999 urban residents. Probabilities are rounded independently.

## Equivalent history comparison

Completed with `pnpm report:history`. Baseline: latest completed equivalent detailed report, `../2026-10-03T15-23-08-404Z-urban-siege-chance/100.json`, selected explicitly with `HISTORY_BASELINE`. Both runs use seed 14963991, era lateMedieval, 204000 requested points, start 867, duration 100 years, late-knowledge threshold 2.366478320318625, standard detailed diagnostics and no profiling. `HISTORY_OUT` unset. Full comparison: `100-diff.html`. Previous reports are preserved.

| Encounter | Previous count | New count | New share |
| --- | ---: | ---: | ---: |
| Open battle | 6876 | 6461 | 85.49% |
| Ambush | 564 | 455 | 6.02% |
| River crossing | 131 | 105 | 1.39% |
| Siege start | 394 | 537 | 7.11% |
| Total | 7965 | 7558 | 100% |

Shares count each siege once at its start, not once per tick. Siege starts increase 36.29%; their share rises from 4.95% to 7.11%. The 95% conditional probability does not imply 95% globally: most encounters are not siege-eligible. Ambush and river-crossing counts decrease by 19.33% and 19.85%, consistent with the explicitly approved reduction at eligible targets plus changes to subsequent random trajectories.

Initial town provinces increase from 750 to 779. River provinces remain 1217; initial eligible target samples remain 144, and their force-ratio spread is unchanged.

| Statistic | Previous | New |
| --- | ---: | ---: |
| Completed sieges | 393 | 537 |
| Median siege phases | 3 | 3 |
| p90 siege phases | 5 | 6 |
| p99 siege phases | 8 | 8.64 |
| Completed wars | 1393 | 1311 |
| Median war years | 1.048 | 1.149 |
| p90 war years | 4.364 | 4.731 |
| War attacker win share | 73.37% | 72.08% |

Each phase remains 30 days. The p99 is interpolated by the existing quantile function, so it need not be a whole phase. Siege outcomes: surrendered 198, starved out 215, betrayed 16, stormed 93, relieved 10, lifted 5. All 537 finish before the horizon; zero are running. Lifecycle checks and annual military validation pass.

Median war duration increases 9.66%, p90 increases 8.40%, completed wars decrease 5.89%, and war attacker win share decreases 1.28 percentage points. These are behavior changes from more siege encounters and altered later trajectories. Siege length rules were not adjusted; duration statistics change with the sample of encounters.

## Performance and verification

| Observation | Previous | New |
| --- | ---: | ---: |
| Wall time | 65.98s | 64.41s |
| Generation time | 15.42s | 18.27s |
| Peak memory | 1169860KB | 1151396KB |

Generation time is 18.49% higher in this single run; wall time and peak memory decrease. Timing and memory are separate from simulation statistics and do not establish causal effects from this change.

Passed `pnpm lint`, `pnpm typecheck`, 5 battle-kind/shared-resolver tests, 13 battle regression tests, and the completed detailed history benchmark. Selector tests verify exactly 9500 siege choices in 10000 evenly spaced draws both with and without rivers, at the 2000-person boundary; unchanged distributions are checked below the threshold and when siege force eligibility fails. Siege calibration was not rerun because the phase loop is unchanged.

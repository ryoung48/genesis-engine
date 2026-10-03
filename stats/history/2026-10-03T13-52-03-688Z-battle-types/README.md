# Battle types and siege comparison

Completed with `pnpm report:history`; `100-diff.html` compares to `../2026-10-03T00-12-28-000Z-history-pipeline-merged/100.json`.

Both runs: seed 14963991, lateMedieval, 204000 requested points (204001 generated, 12746 provinces), start 867, 100 years, late-knowledge threshold 2.366478320318625. Standard detailed diagnostics, no profiling; `HISTORY_OUT` unset and exact `HISTORY_BASELINE` supplied. The baseline is a detailed report with the full century and snapshots, although its older metadata lacks an explicit completion flag. The comparison flags older metadata differences.

## Simulation

| Statistic | Baseline | Battle types |
| --- | ---: | ---: |
| Completed wars | 1400 | 1307 |
| Median war years | 1.0158 | 0.9611 |
| p90 war years | 4.4222 | 4.4462 |
| Battles | 8058 | 7597 |
| War attacker win share | 72.29% | 74.90% |
| Exhaustion ending share | 20.86% | 21.12% |
| Stalled ending share | 6.79% | 7.04% |

There are 6971 open battles, 531 ambushes and 95 river crossings, plus 114 siege starts. Open is the plurality; ambushes are 6.99% of battles, inside the 3-9% band. Eligibility tests enforce river and town restrictions.

113 sieges finish and one remains in an active war at the horizon. Outcomes: surrendered 54, starved out 38, betrayed 1, stormed 15, relieved 4, lifted 1. Completed siege phases: median 2, p99 7. These differ from isolated calibration because the world changes membership, deployments, occupation and peace between phases. Siege starts/ends are paired, no beat falls outside a siege, no siege outlives its war, and active state matches the journal. Annual military validation passes.

Sieges delay occupation until resolution and add monthly attrition. The additional random draws also change later wars, so a seed-equivalent run is not a paired experiment on otherwise identical wars. The slight decrease in median war duration is not the expected isolated siege effect, but the p90 increases slightly. Completed wars decrease 6.64%, battles decrease 5.72%, and attacker success increases 2.62 percentage points; these are model behavior changes retained for review, not calibrated away.

Initial world: 750 towns, 1217 river provinces, 144 eligible target samples. Initial force ratios: min 8.433626876656279, median 118.8284912341113, p90 258.8043338254924, max 320.4382529310275.

## Timing and memory

Wall time: 369.25s baseline, 62.74s current. Peak memory: 1251660KB baseline, 1200576KB current. Generation: 14.52s baseline, 17.40s current. Timing is a single-run observation; the baseline predates the repository's scoped military reconciliation optimization, so the large wall-time reduction cannot be attributed to battle types. Generation time grew 19.82% and should be treated as an observed single-run regression, not evidence of a siege-generation cost.

## Calibration and verification

`calibration.json` records 64 production-loop scenarios, each with seed 2025 and 20000 runs: flat ground/hills, physical multiples 1/10, relief 0/0.5, ratios 1.2/2/4/8/20 plus the initial-world min/median/max. Median phases are 3-7, p99 8-15, maximum 23; minimum fall share 91.23%, maximum betrayal 7.465%, storms 14.16-18.275% when ratio >=2. No phase cap is reached. Wearing interval 3 failed the median band at ratio 1.2 (8 phases); interval 2 passes all bands. `python-calibration.txt` preserves the original flat-ground script rerun with that interval and the observed ratio spread before its removal.

Passed: lint, typecheck, 60 battle/siege/timeline tests, 56 peace/recruitment/deployment/breakaway tests, siege translator and recruitment-record tests, and this detailed history test. Browser component fixture verification exercised production war/timeline components, mention navigation, date selection and troop snapshot dates; `ui.png` was visually inspected. It does not claim a generated-world browser run.

The earlier completed implementation report in `../2026-10-03T13-29-36-150Z-battle-types/` is retained. This final run includes actual-loss accounting and lifecycle diagnostics; simulation statistics are unchanged from that run.

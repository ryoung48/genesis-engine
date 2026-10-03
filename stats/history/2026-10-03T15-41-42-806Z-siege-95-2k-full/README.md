# Partial full-benchmark attempt

This attempt of `pnpm report:history` used seed 14963991, lateMedieval, 204000 requested points, start 867, duration 933 years, late-knowledge threshold 2.366478320318625, standard detailed diagnostics and no profiling. Its baseline was `../2026-10-03T04-16-15-521Z-scoped-military-reconcile/933.json`.

The 800-year checkpoint through 1667 was saved, but serializing the next checkpoint failed with `RangeError: Invalid string length` at `JSON.stringify(saved, null, 1)`. `933.json` is therefore **partial**, with `diagnostics.completed = false`, and must not be used as a completed baseline. `933-500.json` is also a partial checkpoint.

The report writer was changed to compact JSON, retaining all fields and avoiding the whitespace overhead that exceeded Node's string limit. The full equivalent rerun is in `../2026-10-03T15-51-17-072Z-siege-95-2k-full/`. These partial artifacts are preserved for diagnosis; the final report and comparison are in that later folder.

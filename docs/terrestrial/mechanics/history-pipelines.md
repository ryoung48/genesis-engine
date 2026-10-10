# History pipelines

Scope: `:history`.

| Producer | Selection | Clock | Capabilities |
| --- | --- | --- | --- |
| Pipe 1: Earth | Existing Earth-import provenance | Stored history dates | Stored nations, wars, cultures, religions |
| Pipe 2: simulation | Detailed history / HISTORY_PIPELINE=simulation | Existing simulation start | People, titles, population, military and economy |
| Pipe 3: distribution | Fast history / HISTORY_PIPELINE=distribution | AD 2 to 2025-01-01 | Flat countries, territorial history, simple directed wars, static culture/religion |

Fast history is the application default after all six checkpoints passed on 204,000-point seeds 14963991,42,12345, with zero annual ownership/connectivity/capital/lifecycle violations. The completed calibration is `stats/history/2026-10-10T01-20-34-437Z-distribution-history-final/2023.json`. The report runner retains its simulation default for benchmark reproduction; select `HISTORY_PIPELINE=distribution` for fast-history reports. This calibration gate is an implementation check, not a runtime dependency on files in stats. There is no fallback to detailed simulation after a fast-history error.

## Common record and frame contracts

HistoryRecord has required pipeline (earth/simulation/distribution) and geographic origin (earth/procedural). Consumers check people, titles and economy capabilities rather than infer them from procedural origin. Both procedural producers use shared initial metadata/log construction; detailed people initialization remains in SIM_RECORD. Pipe 3 sends a ready HistoryState at AD 2 without initializing SIM_ENGINE, titles or organizations.

All timelines query HISTORY.frameAt. Fast records have people/titles null, no census, no organizations or government simulation. Frames retain zero-filled population/development arrays and economy null; unsupported controls are hidden. They are absence of a demographic model, not measured zero population. Historical identities remain available after absorption.

Fast record time is DATE.eu4DateToTimeMs(year.1.1), with the shared 365-day calendar and 86,400,000 ms/day. AD 2 is exactly zero; 2025 is exactly 2,023 transitions later. No detailed translator conversion is applied.

## Worker ownership and playback

Generation knows the selected producer before political placement. Distribution replaces era ownership with AD 2 flat countries and indexes that placement once. Its live graph is copied before generated-world buffers are transferred. Earth has no procedural-engine payload; detailed initialization/progress carry journals; fast initialization/progress carry a record state and sparse batches.

Each annual step is synchronous and deterministic. Playback then yields through a macrotask (setTimeout 0), allowing pause and regeneration messages to run before another year begins. Transport combines at most 20 completed years. A processed pause flushes the partial batch and acknowledges its completed throughTimeMs. Resume preserves the RNG and annual boundary. Completion flushes the final partial batch, stops playback and clamps at 2025. Worker generation sessions and current-worker checks reject stale output after regeneration.

Sparse batches contain annual province owner/controller events, identity/nation patches and war lifecycle patches. Sequence ranges prevent applying a batch twice and reject missing ranges. Ownership events coalesce only within one year; merging transport preserves every year's changes. Batches advance maxTimeMs even without events, invalidate cached changed/future frames and are released after publishing/consumption.

Empty and all-desolate worlds publish valid empty records, retain owner/controller -1 at input length and advance through every annual boundary without political RNG. Their timeline availability does not require a positive country count.

## Controls and verification

The existing SimulationControls.extraControls and SegmentedControl expose Fast history / Detailed history. Changing choice regenerates at the same seed. Fast history labels and scrubbing use DATE and annual steps. Simple nation borders, identities, culture/religion and active wars remain available; detailed title, government, dynasty, population and economy controls are absent.

Deterministic fixtures cover streaming, apply-once batches, shared folding, current-revision connectivity, actual MessageChannel pause during a transport batch, cancellation, alternate transport sizes and empty completion. The final browser check at 204,000 requested points, seed 42, verified the default AD 2 producer, pause stability, completion at 2025 and scrubbing at every checkpoint without page errors. It measured 41.62 seconds for generation/display setup and 112.03 seconds for playback including a brief pause; results are saved in `stats/distribution-ui-big-check.json`. Detailed report statistics are separate from smoke-test invariants. See [distribution rules](../politics/distribution-history.md), [smoke tests](smoke-tests.md) and [record ownership](record-memory.md).

# Generation timing and estimated progress

Procedural generation and heightmap import return a nested timing profile. The existing Timing panel consumes the profile directly; clicking a row with children opens its breakdown. Breadcrumbs return to the parent.

## Measurement

`src/model/shared/timing/index.ts` owns the `TIMING` namespace. Its types live in `src/model/shared/timing/types.ts`. Each entry contains `Stage`, numeric milliseconds in `ms`, and `children`. Recording is silent: generator timing and nation diagnostics no longer print console tables or logs.

The Generation entry has Terrain, Environment, Society, and (for procedural worlds) Infrastructure children. Terrain retains collision, elevation, and terrain processing details. Environment contains the shared post-elevation stages. Society contains initial political and cultural derivation and settlement preparation. Infrastructure contains urbanization and route construction details.

The worker adds History initialization and Worker preparation as separate root entries. Initialization retains engine setup measurements. Preparation measures the pathfinding snapshot, serialization, and geometry construction. These measurements use operation boundaries, independently of progress messages.

The panel uses each parent's measured duration rather than adding it to its descendants. Root totals sum the separate root entries. A breakdown shows Uninstrumented time when the parent's duration exceeds its children's sum by at least 1 ms; this avoids presenting instrumentation gaps as measured work. Durations are formatted only for display.

## Saved estimates

`src/ui/genesis/generation/progress/index.ts` stores completed runs under `genesis-timing-v1` in browser localStorage. The key's version must change when the timing format or progress checkpoint meanings change; older versions are ignored.

The cache retains up to eight configurations and the last five successful runs per configuration. Eight bounds retained storage across frequently used settings; five smooths occasional slow runs without retaining a large history. These are cache limits, not simulation parameters.

A configuration includes generation versus import, point count, all supplied scalar settings, and input array lengths or byte lengths. Seeds are excluded so different generated worlds can inform estimates for the same workload. Raster pixels, world geometry, and simulation records are never saved. Each retained run contains only its compact timing tree, total observed duration, and progress checkpoints.

Progress messages include a stable raw stage identifier separately from their display label. Repeated identifiers receive occurrence numbers in the cache. Checkpoints record elapsed time between dispatch and the observed worker message; this works with existing messages that announce completed stages as well as those announcing upcoming work.

For matching runs, the controller averages each checkpoint's fraction of the run and predicts the interval to the next checkpoint. Every 100 ms it moves gently through that interval, approaching at most 90% of the predicted interval until another worker message arrives. The update interval keeps React updates modest; the approach limit avoids claiming an active stage has completed. Progress never reverses, and pending work is capped at 99%. Only the successful completion handler sets 100%.

With no comparable history, or an unknown checkpoint, the existing worker percentages are the fallback. The first successful run teaches subsequent estimates. Failed, cancelled, or superseded runs are not saved. Missing, malformed, inaccessible, or full storage does not prevent generation; caching is best effort. Worker failures and replacement stop the interpolation timer.

The profile shown in the Timing panel is the current run's actual measurement. Progress is an estimate from prior runs, and may differ when machine load or generated world structure changes.

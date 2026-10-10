# Route search performance

This work covers the procedural-planet route build, now the final world-generation stage (`routes`, after urbanisation), so its time is part of generation and the infrastructure overlay reads the result from the generated world. It covers land routes, sea routes and sea neighbor discovery. The worktree is `chaos-machine-route-search`, branch `optimize/route-search`, based on main commit `b24992d3`.

## Production implementation

Land and sea point-to-point routes use exact bidirectional Dijkstra through `ROUTE_SEARCH.findPath` in `src/model/society/infrastructure/trade/routing/search/{index.ts,types.ts}`. Both directions use circular bucket queues. The search expands the frontier with the lower next distance and tracks the best complete path through any region discovered by both sides. It stops only when the sum of the two frontier minima is at least that complete path cost. It does not stop at the first intersection.

Forward state is owned by the route computation. A backward workspace is allocated once and cached by that forward workspace; both are reused across searches with discovery and settlement stamps. The backward arrays add approximately 3.1 MiB for 204,001 regions, plus queue storage. No graph preprocessing is needed for the reverse search. Paths are reconstructed directly from the two predecessor chains. Identical endpoints, invalid eligibility, disconnected graphs, reversed searches and stamp rollover have fixed-input regression checks. Sea neighbor discovery remains the multi-source bucket pass because it finds candidate pairs rather than a single target.

The queue in `src/model/shared/bucket-queue/{index.ts,types.ts}` stores immutable node/distance entries and discards stale entries when removing them. Costs are scaled by four. Land weights 1 and 0.25 become integer weights 4 and 1, requiring five circular buckets. Sea adds the mean of endpoint depth penalties 10, 1 or 0; scaled costs are integers no greater than 44, requiring 45 buckets. `ROUTE_TUNING.search` owns the scale and bounds; tests check every configured edge/depth cost combination against those bounds. Changing costs requires reviewing the integer scale and maximum edge bounds.

Accepted land and sea paths increment `Uint32Array` reference counts indexed by adjacency slot, replacing numeric-key sets in the relaxation loop. `EDGE_USAGE.recordPath` records both directed slots of each undirected edge. Sea records only water edges, excluding its two anchor connections. Shared counting logic has land and sea callers. The fine search keeps the existing-road discount, and reverse costs are symmetric because both directions of a used edge are recorded.

Land eligibility is computed once per route build in `src/model/society/infrastructure/trade/routing/land/eligibility/{index.ts,types.ts}`. A `Float64Array` stores -1 for impassable regions and `landmark * regionCount + cluster` for eligible regions. Cluster IDs are below the region count, so the stride cannot collide; double storage avoids signed-32-bit overflow of combined IDs. Each region relaxation compares one eligibility ID, in addition to its settled stamp. Sea checks the water landmark ID: the landmark builder flood-fills only neighbors with matching land/water status, so a water landmark cannot contain a land region.

Obsolete one-way route-search implementations, multi-target scratch fields and the unused tree-reconstruction API are removed. Corridor and other candidate generators are not retained in code. Earlier local reports and generated snapshots remain preserved under gitignored `stats/routes/`.

## Reproduction and validation

```powershell
$env:ROUTE_REPETITIONS = '5'
$env:ROUTE_SEED = '14963991'
node scripts/benchmark-route-search.mjs
```

The maintained harness compares current production with original main revision `b24992d3`, including that revision's pathfinding module. `ROUTE_BASELINE` overrides the revision. It generates a full 204,000-point late-medieval planet; the mesh contains 204,001 regions. `ROUTE_WORLD` can reuse a saved `world.bin`, with seed, era and point-count validation. `ROUTE_EXPECTED_REPORT` can point to an earlier bidirectional report to require production's complete route and network fingerprint to match its tested `bidirectional` result.

Each repetition builds the complete network from scratch, including eligibility, depth penalties, candidate discovery, counters, queue allocation and output construction. Generation/loading is measured separately. One warmup precedes measured runs, and order alternates. Raw samples, independent stage medians, ranges, paired speedups and output hashes are saved under `stats/routes/<run-start>-bidirectional-production/`. Output hashing and verification are outside timing; independent stage medians need not sum to the complete-build median.

`scripts/routes/search-variants.mjs` creates diagnostic snapshots of actual production sources, rather than maintaining another search implementation. These snapshots count examined adjacency slots and settled regions, and check settlement order separately in the two search directions. `scripts/routes/search-oracle.mjs` validates each path against unrestricted immutable-key Dijkstra with the original eligibility conditions and the edge-use state at that query. It checks minimum cost, reachability, endpoints, adjacency and domain constraints, including searches subsequently rejected by a length cutoff. Instrumented output must match uninstrumented output, and repeated runs must be deterministic.

## Measurements before promotion

The decisive comparison used two full planets and seven warmed samples per variant. Production at that time had adjacency slots, precomputed eligibility and one-way buckets; the candidate had the selected bidirectional search. The reports are:

- Seed 14963991, 12,746 provinces: `stats/routes/2026-10-10T19-53-01-499Z-bidirectional/report.json`.
- Seed 42, 12,541 provinces: `stats/routes/2026-10-10T19-54-05-223Z-bidirectional/report.json`.

| Seed | One-way buckets, complete build | Bidirectional, complete build | Land before / after | Sea before / after | Median paired speedup |
| --- | ---: | ---: | ---: | ---: | ---: |
| 14963991 | 2,196 ms | 762 ms | 593 / 233 ms | 1,537 / 444 ms | 2.79× |
| 42 | 1,951 ms | 817 ms | 579 / 283 ms | 1,272 / 451 ms | 2.47× |

These runs followed reported resource contention. A preceding contended run is preserved at `stats/routes/2026-10-10T19-47-15-188Z-bidirectional/report.json`, but its timings are excluded from conclusions. In the fresh comparisons, complete-build ranges were 1,973–2,382 versus 703–888 ms on seed 14963991, and 1,822–2,280 versus 682–863 ms on seed 42. The ranges do not overlap on either planet. Absolute times still describe a shared Windows machine and two seeds, rather than every configuration.

| Seed | Search | One-way region relaxations | Bidirectional region relaxations | Reduction |
| --- | --- | ---: | ---: | ---: |
| 14963991 | Land | 7,044,829 | 2,801,705 | 60.2% |
| 14963991 | Sea | 13,374,268 | 3,723,551 | 72.2% |
| 42 | Land | 6,879,795 | 2,711,633 | 60.6% |
| 42 | Sea | 11,767,664 | 3,587,239 | 69.5% |

Sea route timing includes neighbor discovery, which keeps the same algorithm. Work counts describe the full pipeline with each search strategy's evolving edge-use state, not frozen per-query weights. The older reports' `neighbors.relaxations` counter was placed in water-depth preparation rather than neighbor discovery; the maintained diagnostic targets the neighbor-discovery function explicitly. The land and sea route-search counts in the table are unaffected by that diagnostic correction.

Every one of the 3,213 first-planet queries and 2,831 second-planet queries matched the independent optimum for the bidirectional candidate. Both directions had zero settlement-order violations. Accepted routes change through equal-cost tie choices, later road discounts and physical-length cutoffs: bidirectional produced 2,677 and 2,330 routes, compared with the one-way version's 2,692 and 2,326. The selected production implementation is checked against those complete saved fingerprints after promotion.

Earlier isolation reports showed slots preserving the original output while reducing total median time about 36%, and eligibility adding a modest 4–6% reduction. Their preserved reports are `stats/routes/2026-10-10T19-24-46-958Z-route-search/report.json`, `stats/routes/2026-10-10T19-35-03-974Z-slots-eligibility-buckets/report.json`, and `stats/routes/2026-10-10T19-36-37-623Z-slots-eligibility-buckets/report.json`. Those measurements used different runs and are not additive speedup estimates.

## Rejected corridor experiment

A coarse province BFS plus one neighbor ring was tested on top of bidirectional search, both for major routes only and for all land routes. The existing province adjacency includes sea crossings, so the final comparison built coarse adjacency only from eligible land borders. That eliminated disconnected-corridor retries.

Despite 43–63% fewer fine land-region relaxations, coarse search and preparation consumed much of the benefit. Complete-build medians were 727 / 732 / 736 ms for unrestricted / major-only / all-land on seed 14963991, and 813 / 772 / 842 ms on seed 42. Ranges overlapped. About 53% of major searches missed the unrestricted optimum; affected paths cost 61% more on average. With all-land corridors, 30–34% of land searches were nonoptimal. These are weighted travel-cost errors, not physical-length percentages.

The final corridor reports remain local at `stats/routes/2026-10-10T20-02-04-549Z-land-province-corridor/report.json` and `stats/routes/2026-10-10T20-02-47-294Z-land-province-corridor/report.json`. The speed/accuracy tradeoff did not justify retaining the approach, and its source generators were removed.

## Verification after promotion

`pnpm lint`, `pnpm typecheck`, all ten focused queue/eligibility/edge-usage/bidirectional tests, and all 380 tests across 42 history smoke files pass. Related history selection finds no history smoke dependencies for these lazy-overlay route modules. Benchmark script syntax and whitespace checks also pass.

Both promoted-production comparisons use five warmed samples on the saved full planets. Production matches the complete saved bidirectional route/network fingerprint on both seeds, passes all 6,044 independent minimum-cost checks, and has zero settlement-order violations. Final reports are:

- Seed 14963991: `stats/routes/2026-10-10T20-13-57-930Z-bidirectional-production/report.json`.
- Seed 42: `stats/routes/2026-10-10T20-15-08-206Z-bidirectional-production/report.json`.

| Seed | Original main, complete-build median | Promoted production, complete-build median | Median paired speedup |
| --- | ---: | ---: | ---: |
| 14963991 | 2,756 ms | 751 ms | 3.68× |
| 42 | 2,337 ms | 650 ms | 3.67× |

These compare all retained optimizations with original main, unlike the earlier bidirectional-isolation table. They are not additive estimates. The maintained diagnostics read actual production search code; no separate bidirectional implementation or corridor generator remains in the benchmark scripts. The unused forward target arrays and output-tree rewrite from the prototype are omitted because route assembly now consumes the reconstructed path directly.

History now builds a second persistent network at initialization and updates it in census batches. Search changes therefore affect historical route state and require an equivalent detailed history comparison, even while roads have no other simulation consumers. See [road network](road-network.md). Generation retains its `routes` stage; imported Earth worlds carry no routes.

The benchmark accepts `ROUTE_WORLD` for saved inputs, `ROUTE_EXPECTED_REPORT` for the saved `results.production.hash`, and `ROUTE_PREVIOUS_ROUTES` for the prior production `routes.json`. It writes the current `routes.json` alongside its report, counts changed paths only among surviving pairs, measures added/removed pairs against that supplied production output, and records survivor-pair flips under moving and fixed projections. Freshly generated routes must equal a direct build on the same fields.

Generated routes match saved production fingerprints computed from the same inputs for seeds 14963991 and 42. At 204,000 points the `routes` stage took 728.8 ms on seed 14963991 and 1,276 ms on seed 42 (the latter run shared the machine with other work). The packed routes and network are about 0.37 MiB; the cached world file grows by about 1.1 MiB. No tests or benchmarks remain running after completion.

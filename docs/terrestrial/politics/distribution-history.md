# Distribution history

Scope: `:history`, Pipe 3. Fast history is the generated-world application default; Detailed history remains explicitly selectable. It models independent countries, neighboring conquest and fragmentation from AD 2 through 2025-01-01. Culture and religion are static context. It does not simulate people, titles, subjects, armies, economy or population.

## Measured targets

Country percentages are country-count shares. Sizes represent approximately 10,000 km² per generated province. Sum stored country area first, then round `max(1, floor(area / 10000 + 0.5))`; do not use EU4 province counts as generated sizes.

Source: `public/earth-data/earth-real-population-eu4.json` (`provinceAreasKm2` joined through `rawProvinceIds`) and `public/earth-history/events/provinces.json`. Exclude wasteland and REB/PIR/NAT/---. Checkpoint source dates are 2.1.1, 476.9.4, 1066.9.15, 1701.9.1, 1914.7.28 and 2025.1.1. Subjects and HRE members remain separate recorded tags. These are stored-data reference distributions, not a historical census. The one-province minimum distorts very small countries.

| Checkpoint | 1 | 2–4 | 5–9 | 10–24 | 25–49 | 50–100 | 101–ceiling |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2 — mature ancient | 15.0649% | 43.1169% | 24.4156% | 11.6883% | 3.3766% | 1.2987% | 1.0390% |
| 476 — fragmentation | 17.9028% | 41.1765% | 21.7391% | 9.9744% | 5.1151% | 2.3018% | 1.7903% |
| 1066 — medieval | 25.5898% | 32.6679% | 19.2377% | 15.2450% | 4.1742% | 1.6334% | 1.4519% |
| 1701 — early modern | 26.0664% | 29.3839% | 20.1422% | 15.1659% | 4.2654% | 2.3697% | 2.6066% |
| 1914 — imperial | 15.8273% | 25.1799% | 10.0719% | 17.9856% | 5.7554% | 7.1942% | 17.9856% |
| 2025 — modern | 14.0625% | 15.6250% | 12.5000% | 17.1875% | 13.0208% | 13.5417% | 14.0625% |

Exact country-count numerators (in the same bucket order):

| Checkpoint | Total | 1 | 2–4 | 5–9 | 10–24 | 25–49 | 50–100 | 101+ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | 385 | 58 | 166 | 94 | 45 | 13 | 5 | 4 |
| 476 | 391 | 70 | 161 | 85 | 39 | 20 | 9 | 7 |
| 1066 | 551 | 141 | 180 | 106 | 84 | 23 | 9 | 8 |
| 1701 | 422 | 110 | 124 | 85 | 64 | 18 | 10 | 11 |
| 1914 | 139 | 22 | 35 | 14 | 25 | 8 | 10 | 25 |
| 2025 | 192 | 27 | 30 | 24 | 33 | 25 | 26 | 27 |

Country shares alone cannot determine count or concentration. Use these measured conditional mean sizes for the same buckets:

| Checkpoint | 1 | 2–4 | 5–9 | 10–24 | 25–49 | 50–100 | 101–ceiling |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2 | 1.0000 | 2.7410 | 6.2234 | 14.0222 | 35.1538 | 58.0000 | 317.2500 |
| 476 | 1.0000 | 2.7950 | 6.3176 | 14.6923 | 32.2000 | 63.5556 | 190.5714 |
| 1066 | 1.0000 | 2.8111 | 6.4906 | 15.8214 | 35.2609 | 65.1111 | 162.5000 |
| 1701 | 1.0000 | 2.6290 | 6.3882 | 14.8750 | 34.8333 | 72.6000 | 447.4545 |
| 1914 | 1.0000 | 2.6000 | 6.2857 | 15.4400 | 37.1250 | 68.3000 | 444.4000 |
| 2025 | 1.0000 | 2.6000 | 6.4583 | 15.6364 | 36.0800 | 71.6923 | 349.8148 |


Means have four decimal places; weights use the exact count ratios. AD 2's reference mean is 3745/385 provinces, within the precision of the stored conditional means. Interpolate shares and means linearly by year. Never interpolate ceilings or extrapolate beyond 2025.

## Whole-period ceilings

Scan every ownership-change date, apply all same-date events together, and include period boundaries. Sum country area and use `ceil(peakArea / 10000)`, rather than the histogram's nearest-integer rounding. These independent-country caps have no colonial-subject aggregation or unmeasured headroom.

| Applicable years | Recorded peak | Peak date | Exact province equivalents | Pipe 3 ceiling |
|---|---|---|---:|---:|
| 2–475 | Roman Empire | 116.1.1 | 499.9165 | **500** |
| 476–1065 | Umayyad | 740.1.1 | 808.1198 | **809** |
| 1066–1700 | Mongol Khanate | 1258.2.10 | 1869.8019 | **1,870** |
| 1701–1913 | Russia | 1911.12.29 | 2013.4263 | **2,014** |
| 1914–1946 | Soviet Union | 1945.8.15 | 2188.2394 | **2,189** |
| 1947–2025 | Soviet Union | 1947.1.1 | 2188.2394 | **2,189** |


## Numerical projection

For each bucket use a bounded law proportional to `size^(-alpha)`. Clamp requested means to truncated support. Endpoint means require point masses. For interior means begin with [-64,64], double endpoints until bracketed, then bisect for at most 64 iterations to absolute mean error at most 0.0001 province. Evaluate log weights relative to the favored endpoint. If bisection cannot meet tolerance, mix the bracketing PMFs to preserve the specified first moment; numerical fallbacks and clamping are reported.

Project each original connected eligible component separately, before placement and without RNG. Clip support by the lesser of component capacity and the period ceiling, discard unsupported bucket weights, and normalize the rest. Let `mu` be the fitted mean; select the nearest feasible integer count to `capacity/mu`, ties toward the smaller count. Midpoint quantiles produce immutable country ordinals. Balance total mass by single-province moves; each move minimizes the next objective, ties toward the smaller old size and then the lowest ordinal.

The objective sums three equally weighted squared errors: bucket country counts, bucket province masses and exact-size counts. Each term divides by its expected count/mass plus 1, a one-observation regularizer. This is a deterministic greedy projection, not a global optimum. Aggregate the resulting integer multisets by counts and masses, never by averaging component percentages. Placement cannot change this fixed acceptance target. PMF diagnostics and projection objectives remain separate from geographic distortions.

Empty eligible territory has zero target count, mean, shares and loss, with statistical applicability false. It consumes no political RNG. Positive territory without countries fails validation.

## Placement and territorial validity

All non-desolate provinces are eligible, independent of the era's statehood mask. The shared `PLACEMENT.placeCountries` orchestration uses the existing seed, frontier, claim and blocking primitives. Simulation policy retains title-unit claims, title-seat capitals and whole-component residual attachment. Distribution policy claims one province at a time, uses seed capitals, permits angular spread pi, restricts quotas to their original component and stops at the quota/ceiling.

Largest-first quotas preserve the large-country tail. Residuals claim neighboring countries' remaining capacity one province at a time. Otherwise they create connected countries from locally projected sizes, largest first. Isolated residuals are partitioned within the ceiling. Quota undershoots and residual-created countries are measured against the original projection. Placement runs once during generation; engine creation only indexes its result.

Ownership and control coincide; province parents are -1. Every country has an owned capital. Border captures preserve its identity. Nonfinal capitals and current articulation points cannot be captured. A final province terminates the defender exactly once. Articulation caches are keyed by country identity and ownership revision. Gains, losses and splits invalidate affected ownership caches; each subsequent capture rechecks current ownership and adjacency.

Splits cut a rooted depth-first spanning-tree subtree. Reverse discovery order supplies subtree sizes; only an accepted cut materializes its province list. This permits substantial connected cuts where a breadth-first tree would offer only small branches. Both successor and retained country must be connected. The retained country keeps its core and identity; the successor receives a new ID and owned capital. Mandatory splits enforce ceilings regardless of war/cooldown. Discretionary splits need positive normalized gain, no active incident attack and no cooldown.

## Attack and fragmentation rules

Each country has at most one outgoing target, with unrestricted independent incoming attacks. Only current neighbors are eligible, and reciprocal pairs are excluded. Eligible fronts must permit a current legal capture and full absorption within the component/period ceiling. Declaration weight is shared border edges × min(1,(attackerSize/defenderSize)^4) × bias × annual completion rate. The annual completion rate is min(1,captureProbability×max(1,floor(0.02×attackerStrength))/defenderSize), using existing incident fronts plus the proposed front. The report also records min(1,40×completionRate); target choice preserves the preference for faster absorptions within that forty-year window. A quarter-size attacker receives 1/256 of equal-size eligibility before other factors.

Loss is country-share TV/0.10 + province-mass TV/0.15 + absolute log count ratio/log(1.25). The weights measure errors against the existing acceptance budgets, preventing exact count from dominating useful size-distribution corrections. Candidate gain is loss reduction divided by the candidate's own state-step distance, with targets frozen. The distance uses the same weighted TVs and weighted absolute log count change; zero-distance actions are neutral. Gain is bounded [-1,1]. Bias is clamp(exp(2×gain),0.25,4), avoiding dilution of small improving actions in larger worlds.

Idle countries declare with probability min(1,0.04×maximum candidate opportunity), where opportunity is min(1,(attackerSize/defenderSize)^4)×bias, then choose one weighted target. New attacks resolve starting next year. Expired or invalid fronts close before opening-year province strength is divided across remaining incident attacks. Applying the size penalty to declaration probability prevents target-choice normalization from erasing it for countries with one eligible neighbor. Capture probability is attackerStrength²/(attackerStrength²+defenderStrength²). A successful draw proposes up to max(1,floor(0.02×attackerStrength)) connected captures, with a fresh validity check before every commit. Wars end on absorption, loss of adjacency, blocked fronts, ceiling, or 40-year duration. Outgoing-war cooldown is 5 years. Both split successors have a ten-year cooldown. Discretionary split probability is min(0.08,0.01×exp(2×splitGain)). These are model pacing choices, not measured historical rates.

## Calibration limits

The original complete 204,000-point, three-seed runs conserved territory and identity invariants, but all exceeded the AD 1914 country-count tolerance. Larger capture budgets and ordinal-first placement were tested and did not justify replacing the original mechanism. Targets and tolerances remain unchanged. The subsequent repair passes all required checkpoints on all three large-world seeds: `stats/history/2026-10-10T01-20-34-437Z-distribution-history-final/2023.json`. Declaration opportunity retains absolute size eligibility, target weights favor faster feasible absorptions, the steering score uses the acceptance budgets, and depth-first cuts offer substantial connected fragments. Annual ownership/connectivity/capital/lifecycle violations are zero. Targets and tolerances remain unchanged; Fast history is now the application default.

The gate requires every checkpoint at 2/476/1066/1701/1914/2025 on seeds 14963991,42,12345 at 204,000 points to satisfy country TV ≤0.10, province-mass TV ≤0.15 and relative count error ≤0.25, with zero annual invariant violations and nonempty territory. See [history pipelines](../mechanics/history-pipelines.md) and [performance measurements](../mechanics/pipeline-performance.md).

Split planning shares one current histogram across the country pass and updates affected buckets after each successful split. Cuts with identical successor histograms share their score within that country, including symmetric cuts and any two successors in the same bucket; tie ordering and RNG use are preserved. The detailed report records the weighted steering loss alongside its three constituent errors.

# CK3 title and realm sizing notes

This document summarizes the CK3-derived sizing work used to compare `src\model\society\nations.ts` buckets against Crusader Kings III.

## Landed title counts

Across the full `game\common\landed_titles` folder:

| Rank | Count |
| --- | ---: |
| Baronies (`b_`) | 11,295 |
| Counties (`c_`) | 4,705 |
| Duchies (`d_`) | 1,096 |
| Kingdoms (`k_`) | 269 |
| Empires (`e_`) | 89 |
| Hegemonies (`h_`) | 5 |

`00_landed_titles.txt` alone contains:

| Rank | Count |
| --- | ---: |
| Baronies | 9,155 |
| Counties | 2,825 |
| Duchies | 899 |
| Kingdoms | 222 |
| Empires | 69 |
| Hegemonies | 4 |

Additional landed title definition files in the same folder:

- `01_japan.txt`
- `01_japan_noble_family.txt`
- `01_korea_noble_family.txt`
- `01_other_noble_family.txt`
- `02_china.txt`
- `03_seasia.txt`
- `04_china_noble_families.txt`
- `05_goryeo.txt`
- `06_philippines.txt`

## Average title fanout

Direct-child averages across the full landed title dataset:

| Metric | Average |
| --- | ---: |
| Baronies per county | 2.40 |
| Counties per duchy | 3.17 |
| Duchies per kingdom | 3.39 |
| Kingdoms per empire | 2.72 |
| Kingdoms per hegemony | 0.00 |

If zero-child/special titles are excluded, the averages among titles that actually have those children are:

| Metric | Average |
| --- | ---: |
| Baronies per county | 3.25 |
| Counties per duchy | 3.82 |
| Duchies per kingdom | 4.28 |
| Kingdoms per empire | 5.63 |

## County area estimate

Best estimate for CK3 county area:

- **~15,000 km² per county** for mapped landed counties
- Practical uncertainty band: **~13,000-17,000 km²**

Method summary:

1. Parse barony `province = ...` assignments from landed title files.
2. Sum province pixels from `map_data\provinces.png` through `definition.csv`.
3. Calibrate map scale against known real-world locations instead of assuming a full-globe map.

Area-pass results:

| Basis | Average county area |
| --- | ---: |
| Mapped counties only | 14,800-15,100 km² |
| All county titles including zero-province/admin placeholders | 10,900-11,200 km² |

Supporting observations:

- Province-linked parse mapped **3,476** counties with landed area.
- The mapped-only median county area was about **12,500-12,800 km²**.
- The top-level map fit looked roughly like **-18° to 156° longitude** and **78°N to 14°S**.

## Average counties per culture / heritage / faith / religion

Redoing the culture/faith rollup against the current Steam install with the correct denominator (counties in `game\common\landed_titles` that have at least one province-linked barony) produced **3,431** mapped counties on this install.

Using that mapped-county set:

| Bookmark | Counties | Cultures | Heritages | Faiths | Religions | Avg/culture | Avg/heritage | Avg/faith | Avg/religion |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 867.1.1 | 3,431 | 201 | 55 | 98 | 46 | 17.07 | 62.38 | 35.01 | 74.59 |
| 1066.1.1 | 3,431 | 201 | 53 | 96 | 46 | 17.07 | 64.74 | 35.74 | 74.59 |

Standard deviation of county counts across groups (population σ, computed from current-install parse; known-county groups only):

| Bookmark | STD/culture | STD/heritage | STD/faith | STD/religion |
| --- | ---: | ---: | ---: | ---: |
| 867.1.1 | 19.96 | 62.36 | 63.57 | 147.70 |
| 1066.1.1 | 19.50 | 62.13 | 76.03 | 177.50 |

`UNKNOWN` buckets remained for counties whose mapped baronies did not resolve cleanly through the available province-history files on this install (**132** counties in both bookmarks). Excluding that unknown bucket:

| Bookmark | Known counties | Avg/culture | Avg/heritage | Avg/faith | Avg/religion |
| --- | ---: | ---: | ---: | ---: | ---: |
| 867.1.1 | 3,299 | 16.50 | 61.09 | 34.01 | 73.31 |
| 1066.1.1 | 3,299 | 16.50 | 63.44 | 34.73 | 73.31 |

Standard deviation of county counts across groups (known counties only, same values as above since unknowns are not attributed to any group):

| Bookmark | STD/culture | STD/heritage | STD/faith | STD/religion |
| --- | ---: | ---: | ---: | ---: |
| 867.1.1 | 19.96 | 62.36 | 63.57 | 147.70 |
| 1066.1.1 | 19.50 | 62.13 | 76.03 | 177.50 |

This redo is lower than the wiki/original-study **3,476** mapped-county figure, so treat these averages as a current-install estimate rather than a strict recreation of the original version/method.

## CK3 size ladder in county counts

Observed de jure size distributions:

### Duchies

- Median: **4** counties
- Interquartile range: **3-5**
- 90th percentile: **6**
- Max: **9**

### Kingdoms

- Median: **15** counties
- Interquartile range: **11-20**
- 90th percentile: **26**
- Max: **51**

### Empires

- Median: **77** counties
- Interquartile range: **55-97**
- 90th percentile: **122**
- Max: **187**

### Hegemony

- The de jure hegemony case found in landed title hierarchy was **380** counties.

## Bucket comparison against `nations.ts`

Current model buckets:

```ts
export const NATION_BUCKETS: [number, number][] = [
	[50, 100],
	[25, 49],
	[10, 24],
	[5, 9],
	[2, 4],
	[1, 1],
]
```

For CK3-style county-count buckets, the breakpoints themselves are already close to correct. The recommended ladder is:

```ts
// smallest -> largest
[1, 1]
[2, 4]
[5, 9]
[10, 24]
[25, 49]
[50, 200] // or 50+ in display/history
```

In `nations.ts` descending order:

```ts
export const NATION_BUCKETS: [number, number][] = [
	[50, 200],
	[25, 49],
	[10, 24],
	[5, 9],
	[2, 4],
	[1, 1],
]
```

Why those breaks fit CK3:

- **Duchies:** mostly **2-4** and **5-9**
- **Kingdoms:** mostly **10-24**, with a smaller **25-49** tail
- **Empires:** overwhelmingly **50+**

Observed CK3 tier placement inside the current display ladder:

| Tier | 1 | 2-4 | 5-9 | 10-24 | 25-49 | 50+ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Duchies (911) | 8 | 669 | 234 | 0 | 0 | 0 |
| Kingdoms (212) | 0 | 5 | 31 | 149 | 26 | 1 |
| Empires (42) | 0 | 0 | 0 | 0 | 6 | 36 |

## Start-date county share by realm-size bucket

Counties were grouped by their top liege realm from title history at the canonical start bookmarks.

### Held counties only

| Bucket | 867.1.1 | 1066.9.15 |
| --- | ---: | ---: |
| 1 | 28.74% | 23.49% |
| 2-4 | 8.12% | 8.49% |
| 5-9 | 7.41% | 8.06% |
| 10-24 | 9.48% | 11.02% |
| 25-49 | 5.94% | 7.04% |
| 50+ | 40.32% | 41.89% |

Held county totals:

- **867:** 3,807
- **1066:** 3,920

### All county titles

| Bucket | 867.1.1 | 1066.9.15 |
| --- | ---: | ---: |
| 1 | 28.71% | 21.74% |
| 2-4 | 8.11% | 7.86% |
| 5-9 | 7.40% | 7.46% |
| 10-24 | 9.47% | 10.20% |
| 25-49 | 5.93% | 7.20% |
| 50+ | 40.38% | 45.54% |

Takeaway: at game start, the **50+** bucket contains the largest share of counties, roughly **40-42%** of held counties.

## Recommended bound for the `50+` bucket

If the top bucket must be bounded instead of open-ended:

- **Recommended:** `50-250`
- **If hegemonies must fit too:** `50-550` or `50-600`

Why:

- Largest non-hegemony start realm in **867**: **123** counties
- Largest non-hegemony start realm in **1066**: **228** counties (`e_hre`)
- China hegemony at start dates: **533** and **541** counties

Recommendation:

```ts
[50, 250]
```

This covers every normal start-date mega-realm without letting the China hegemony determine the cap.

## References

Primary CK3 files used:

- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\common\landed_titles\00_landed_titles.txt`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\common\landed_titles\01_japan.txt`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\common\landed_titles\01_japan_noble_family.txt`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\common\landed_titles\01_korea_noble_family.txt`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\common\landed_titles\01_other_noble_family.txt`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\common\landed_titles\02_china.txt`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\common\landed_titles\03_seasia.txt`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\common\landed_titles\04_china_noble_families.txt`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\common\landed_titles\05_goryeo.txt`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\common\landed_titles\06_philippines.txt`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\map_data\default.map`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\map_data\definition.csv`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\map_data\provinces.png`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\history\titles\*.txt`
- `C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game\common\bookmarks\groups\00_bookmark_groups.txt`

Project files compared against:

- `C:\Users\rayou\projects\nexus\chaos-machine\src\model\society\nations.ts`
- `C:\Users\rayou\projects\nexus\chaos-machine\src\planet\screen\display\nation-details-model.ts`
- `C:\Users\rayou\projects\nexus\chaos-machine\src\planet\screen\display\nation-details-model.test.ts`
- `C:\Users\rayou\projects\nexus\chaos-machine\src\model\history\history.smoke.test.ts`

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

Counties are grouped by **sovereign ruler**: each held county belongs to its holder, each holder answers to the holder of the liege of their highest-tier title that has a liege, and counties are summed under the ruler at the top. A ruler's separate demesne counties and vassals whose liege is recorded on a higher title therefore stay in their sovereign's realm. The earlier grouping followed only the `liege =` line on each county title, which counted those counties and vassals as realms of their own (1,283 realms at 867 against 820 sovereigns) and put 28.7% of counties in single-county realms against 10.4% by sovereign. `scripts/measure-ck3-governments.py` now groups by sovereign (824 realms on 3,835 held counties at 867, 751 on 3,917 at 1066).

Measured from the local install, in % (820 sovereigns on 3,835 held counties at 867; 752 on 3,917 at 1066):

| Bookmark | Measure | 1 | 2-4 | 5-9 | 10-24 | 25-49 | 50-100 | 101+ |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 867.1.1 | sovereigns | 48.54 | 39.88 | 5.73 | 3.17 | 0.98 | 1.10 | 0.61 |
| 867.1.1 | counties | 10.38 | 21.56 | 7.80 | 10.14 | 6.78 | 15.96 | 27.38 |
| 1066.9.15 | sovereigns | 49.47 | 35.90 | 8.11 | 3.86 | 1.06 | 0.66 | 0.93 |
| 1066.9.15 | counties | 9.50 | 16.93 | 10.11 | 11.56 | 6.59 | 8.37 | 36.94 |

Takeaway: at game start the two largest buckets (**50+**) hold about **43%** of held counties, in under 2% of the realms. Single-county realms are about half of the sovereigns but a tenth of the land.

The history target profile uses these shares; see `docs/terrestrial/politics/land-status-and-targets.md`.

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

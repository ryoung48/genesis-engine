# Title ranks and de jure hierarchy

Scope: `:history`.

De jure is the normative hierarchy of titles; actual territorial ownership can differ. This reference covers title ranks, generation, holding, creation and dissolution. [Government and succession](government-and-succession.md) describes the people who hold the seats.

Code: `src/model/society/dejure` (`index.ts`, `holding/`, `founding/`), tier table in `src/model/society/titles`, runtime wiring in `src/model/history/sim/engine/state/titles/index.ts`, initial setup in `src/model/history/sim/nations/index.ts`.

Titles are fixed regions of provinces. Who holds a title is separate state, computed from province ownership. The realm hierarchy (`parent`) is derived from held titles and their seats.

## Tiers

| Tier | Name | Min size (provinces) | Generated | Founded |
| --- | --- | --- | --- | --- |
| 0 | county | 1 | implicit, one per province | no |
| 1 | duchy | 2 | yes, target 4 | no |
| 2 | kingdom | 8 | yes, target 16 | yes |
| 3 | empire | 40 | yes, target 90 | yes |
| 4 | hegemony | 180 | no | yes |

Sizes are in provinces and come from `TITLES.minSizeForTier`. A province is its own county, so there are no county title records. Each title record has `tier`, `seat`, `holder` and a region (`regionOf[(tier - 1) * provinceCount + province]`).

## Generation (`DEJURE.build`)

Runs once at world generation over active (non-desolate) provinces.

1. Start with each province as a unit.
2. For each of three passes (duchy, kingdom, empire), cluster the current units:
   - Sort units by `seatScore` of their seat: habitability + urban pop / 10,000 + water access bonus.
   - Take the best unassigned unit as a seed and flood-fill neighbors (breadth-first) until the group reaches the target size. No group may exceed the next tier's minimum minus 1.
   - Groups below the tier minimum merge into the smallest adjacent group that still fits under the maximum. A group with no valid neighbor stays undersized.
   - Undersized groups get no title. Their provinces have no region at that tier.
3. The seed unit's seat becomes the group's seat. Groups become the units of the next pass, so the tree is properly nested.

Result: `count`, `tier`, `seat`, `holder` (all `-1` at first) and `regionOf`.

## Holding (`HOLDING.settleTitles`)

Holders are stored state. A title is re-settled whenever ownership of one of its provinces changes, highest tier first.

- The holder is the owner (sovereign) with a strict majority of the region's provinces.
- The holder also needs at least the tier's minimum size, capped at the region's total size.
- If no owner qualifies, the title is vacant (`holder = -1`).
- A holder change emits a `title passed` event.

Seat rule: the seat must be inside the region and owned by the holder. If not, it moves to the holder's best province in the region, ranked by `seatRank * 1000 + seatScore`. That emits a `capital moved` event with cause `title passed` or `seat lost`.

There is no hysteresis. The previous keep/challenge thresholds (holder keeps at 50%, challenger needs 25% and more than the holder) were removed, so control can flip as soon as another owner has a strict majority.

## Founding and dissolving (`FOUNDING`, `CORONATION.elevate`)

Only kingdom, empire and hegemony can be founded, and only as part of a [coronation](government-and-succession.md#coronation): a title above the realm's own rank at a mid-reign elevation coronation, a title at or below it at a new ruler's accession coronation. There is no separate founding charge: the coronation is the one payment, and each coronation founds at most one title.

A realm **qualifies** at tier `T` when:

- it holds at least 2 tier `T-1` titles that it fully owns and that aren't already inside a fully held tier `T` region (`orphansOnly`), and
- those titles together contain at least the tier's minimum size in provinces (kingdom 8, empire 40, hegemony 180). Two two-province duchies are two orphan children but cannot make a kingdom.

`FOUNDING.qualifies` is the one definition; `FOUNDING.found` applies it too. A realm that does not qualify is never screened for money, never rolls and is never flagged composite.

**Raising the realm's rank: the yearly attempt.** Once a year, after the district settle and grant, `CORONATION.elevate` considers every realm in one pass:

1. One sweep of the title registry (`FOUNDING.qualifying`) lists every realm's qualifying children per tier. It reads each title's provinces once to find its sole owner and answers the orphan rule from that cache.
2. Qualifying realms are taken in ascending realm id, one at a time, each to completion before the next. A realm with no ruler or under a regent is skipped.
3. For the realm, only tiers above its own top tier are tried, lowest first. The coronation priced at tier `T` must be at least customary; a tier that fails this takes no roll. Then a roll must pass: 2% + 2% × leader claim, per year. The first tier to pass is elected and the rest are not tried.
4. The elected realm is crowned at once: the title is founded, and the coronation is priced, paid and its gifts given.

The chance is the formula that used to apply once per accession. Applied per year it gives a mean wait from qualifying to elevation of 12.5 years for a child heir (claim 3), 17 for a sibling, 25 for another relative and 50 for a new house, which sits inside the historical spread between holding the lower rank and the elevation coronation (Roger II of Sicily 3 years, Frederick I of Prussia 13, Stefan Dušan 15, Otto I 26, Charlemagne 32, Bolesław I 33). Those cases are illustrative and include time spent acquiring the lands.

**One realm at a time.** A founding rewrites `regionOf` for the provinces it takes and re-settles the titles it took them from, which can pass those titles to another realm. Example: an old kingdom is divided between realms A and B, each holding two of its duchies whole, so both qualify. A founds first; its duchies leave the old kingdom, whose remaining provinces are all B's. B's two duchies now sit inside a kingdom B wholly owns, so they are no longer orphans: B takes the old kingdom by ordinary settlement and founds nothing. So once any title has been founded in a pass, each later realm is requalified against the registry as it then stands, immediately before its money check, and one that no longer qualifies is dropped without a roll. A realm that newly qualifies because of another's founding waits for next year's pass.

Founding merges the children's provinces into a new region, writes the new title into `regionOf` at tier `T` and all higher tiers, and picks the seat: the holder's root province if it's inside the region, otherwise the holder-owned province with the best rank and `seatScore`. It emits `title created`, re-settles the titles it replaced, and relinks the nation. Admins displaced by the redrawn districts are reseated in the following year's settle.

Every elevation raises the realm's rank. If the title registry is full the founding creates nothing, and then nothing is paid, given or recorded.

**Titles at or below the realm's rank: at accession.** A realm that qualifies at or below its own rank (an empire holding orphan duchies that could make a kingdom) founds that title only when a new ruler is crowned. The accession coronation tries those tiers lowest first and founds at most one: the coronation, priced at the realm's own rank as always, must be at least customary, and the same roll of 2% + 2% × leader claim must pass, once per accession. The title changes neither the realm's rank nor the price, so it costs nothing beyond the coronation the new ruler holds anyway. Anything else the realm qualifies for waits for the next ruler. No such title is founded under a regent; a child who acceded gets the attempt at the coronation held at sixteen.

An accession coronation never founds a title above the realm's rank.

**Composite realms.** A realm that, at the end of the yearly pass, qualifies at a tier above its own top tier is a composite realm: it holds the lands of a higher rank without the rank. It is exactly the realm the yearly pass can elevate. Money, a regency and a failed roll do not clear it; they decide whether the realm can act on its position, not whether it is in it. Until it is elevated or loses the lands a composite realm:

- is [easier to break away from](rebellions-and-throne-wars.md#attribute-and-trait-effects), by one weak-claim step;
- keeps its lower top tier, so its districts are one tier smaller and more numerous, and its [partition](government-and-succession.md#partition) hands out titles of the lower tier;
- stands at the lower rank among its peers.

A personal union is not a composite realm: titles are held per realm, so union partners never qualify jointly.

Generation, inheritance, conquest, automatic holder changes and acquisition of an existing or vacant title cost nothing. Dissolution gives no refund, and a later refounding is a new coronation at that day's price. There is no ongoing upkeep and no duchy founding.

A founded title lapses when the nation holds fewer than 2 fully held children for 25 years (`LAPSE_YEARS`). Lapse is checked at each accession coronation, so a title founded mid-reign is first tested when the next ruler is crowned. It then emits `title destroyed` and the region is cleared. Generated titles never dissolve.

## Nation vs its subordinates

- A nation is a sovereign realm. Its id is its root province id, so relations, leaders and wars are indexed by it. Title holders are sovereigns chosen by majority ownership.
- The crown implicitly holds every top-tier title. District admins hold seats exactly one tier below the realm's top tier, outside crown land. Lower titles have no individual holder.

## Derived liege tree (`DEJURE.deriveParents`)

`parent` is recomputed from ownership, title seats and province adjacency. It is never stored ad hoc. The realm's top tier `T` is the highest `seatRank` among its settled provinces, which can exceed the root's rank. Crown seats are the root and every seat of rank `T`. A held tier `T-1` title containing a crown seat is a crown title.

1. The root has no parent.
2. In a county-tier realm, and at every crown seat, land answers to the root.
3. In a duke-tier realm, every non-crown province is a county district seat answering to the root.
4. At higher tiers, land in a held crown title answers to the root. Any other held tier `T-1` title has a district seat answering to the root; land connected to that seat through owned provinces inside the title answers to that district.
5. Remaining provinces attach by a multi-source breadth-first walk through the realm's own territory. The seeds are all provinces placed by rules 1–4, queued by ascending province id; neighbors follow adjacency-list order. Each province follows the crown or district anchor first reached at the fewest steps. An unreachable province answers to the root and uses the existing connection repair.

A held title's fragment separated from its seat uses rule 5, just like loose land. Lower titles can be divided between districts. All district land is connected to its seat through land answering to that district. Crown land can be separated from the capital.

The resulting tree has two levels below the root: district seats and their land. Parent writes go through `settleProvinces` / `applyDerivedParents`, rank-descending for the cycle check. Runtime state caches district flags, the rank at which each seat was last a district, and each root's top tier.

## Comparison with CK3

Similar:

- Tier ladder county → duchy → kingdom → empire → hegemony; the inspected CK3 defines also include hegemony.
- Fixed de jure regions, separate from de facto holdings.
- Each title has a capital seat, and titles are created by holding enough of the tier below.
- Realm hierarchy follows the seats of held titles.

Different:

- Holders are sovereigns chosen by majority ownership, not characters granted titles. No vassal contracts, grants or usurpation.
- The liege tree is derived, not chosen, and has only two levels below the crown; lower titles have no individual holders.
- No de jure drift. The tree changes only when titles are founded or dissolved.
- Founding is a yearly random attempt gated by the coronation the realm can afford, instead of a player decision with a fixed price; CK3 prestige/piety requirements are not modeled.
- Titles can be vacant.
- No barony tier below county.

## Known drift

Nations consolidate more than before the title layer: about 1023 → 826 over 100 years. See the deviations section of `plans/dejure-title-layer.md`.

[Partition](government-and-succession.md#partition) works against that consolidation in tribal land: on the 204,000-point benchmark (seed 14963991, 867–1800) the sovereign count ends at 441 instead of 277 and is 36–167 higher at every century mark, and the held share of kingdom titles seated in partitioning realms falls from 0.91–0.99 to 0.74–0.85. Figures from the 933-year report `stats/history/2026-10-03T18-12-34-411Z-multi-heir-partitions-full/`.

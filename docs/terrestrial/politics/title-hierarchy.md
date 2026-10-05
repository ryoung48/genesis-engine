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

## Founding and dissolving (`FOUNDING`, `considerTitles`)

Only kingdom, empire and hegemony can be founded. A nation tries tiers lowest first and founds at most one title per call. Attempts occur during succession and overthrow, not annually or through a player decision.

A nation can found a title at tier `T` when:

- It holds at least 2 tier `T-1` titles that it fully owns and that aren't already inside a fully held tier `T` region (`orphansOnly`).
- Its posted treasury cash covers the fixed establishment fee. Exact equality is sufficient; debt is ineligible. Pending army costs follow existing settlement rules.
- A roll passes: 2% + 2% × leader claim.

Founding merges those children's provinces into a new region, writes the new title into `regionOf` at tier `T` and all higher tiers, and picks the seat: the holder's root province if it's inside the region, otherwise the holder-owned province with the best rank and `seatScore`. It emits `title created`, re-settles the titles it replaced, and relinks the nation.

Successful founding immediately debits cash once and records a negative `titleCreationExpenses` budget line. Failed rolls, invalid children and null founding results cost nothing. The fee replaces the former peer-revenue gate; cash-rich realms can found regardless of annual revenue.

| Title | Establishment fee (ducats) | Silver equivalent |
| --- | ---: | ---: |
| Kingdom | 625 / 36 (about 17.361111) | 868.055556 kg |
| Empire | 625 / 18 (about 34.722222) | 1,736.111111 kg |
| Hegemony | 625 / 9 (about 69.444444) | 3,472.222222 kg |

These are accepted gameplay calibration prices, not measured medieval coronation tariffs. The [mirrored CK3 title defines](https://github.com/jesec/ck3-mod-base/blob/master/base/game/common/defines/00_defines.txt#L913-L937) give base prices of 500, 1,000 and 2,000 gold. The [army defines](https://github.com/jesec/ck3-mod-base/blob/master/base/game/common/defines/00_defines.txt#L617-L629) give 0.003 gold per soldier; [military localization](https://github.com/jesec/ck3-mod-base/blob/master/base/game/localization/english/gui/militaryview_l_english.yml) identifies levy upkeep as monthly. Matching 0.036 gold per levy-year to this model's 62.5 g silver campaign levy-year at 450 g output per resident-year gives 15,625 / 9 g silver per CK3 gold. With `ECONOMY.ducatsPerGram = 1 / 50,000`, the fixed conversion is 5 / 144 ducats per gold. Preserve precision until display; future military upkeep changes do not change these fees.

Equivalence of soldiers, service duration, equipment and provisioning between the two upkeep models is unverified. There is no demonstrated physical coin weight for a CK3 gold unit, so no additional bullion conversion applies. [John's 1199 chancery ordinance](https://sourcebooks.web.fordham.edu/source/1199Johnfees.asp), [Charles the Bold's ducal accounts](https://www.jstage.jst.go.jp/article/jsmes/8/0/8_26/_article/-char/en), and [Van Gelder's study of coronations and inaugurations](https://cris.vub.be/ws/portalfiles/portal/121350664/Van_Gelder_introduction.pdf) support expenditure on legal instruments, regalia, ceremony and political recognition in particular settings. They do not establish universal rank tariffs, doubling by rank, or expenses exclusive to founding. Keeping succession free is a gameplay scope choice.

Generation, inheritance, conquest, automatic holder changes and acquisition of an existing or vacant title are free. Payment attaches to new creation, not its holder. Dissolution gives no refund; later refounding pays the full fee again, with no permanent paid flag. There is no ongoing upkeep, duchy founding, usurpation fee or discount.

A founded title lapses when the nation holds fewer than 2 fully held children for 25 years (`LAPSE_YEARS`). It then emits `title destroyed` and the region is cleared. Generated titles never dissolve.

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
- Founding is a cash-gated random attempt with a fixed establishment fee instead of a player decision; CK3 prestige/piety requirements are not modeled.
- Titles can be vacant.
- No barony tier below county.

## Known drift

Nations consolidate more than before the title layer: about 1023 → 826 over 100 years. See the deviations section of `plans/dejure-title-layer.md`.

[Partition](government-and-succession.md#partition) works against that consolidation in tribal land: on the 204,000-point benchmark (seed 14963991, 867–1800) the sovereign count ends at 441 instead of 277 and is 36–167 higher at every century mark, and the held share of kingdom titles seated in partitioning realms falls from 0.91–0.99 to 0.74–0.85. Figures from the 933-year report `stats/history/2026-10-03T18-12-34-411Z-multi-heir-partitions-full/`.

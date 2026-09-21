# De jure titles (`:history`)

Code: `src/model/society/dejure` (`index.ts`, `holding/`, `founding/`), tier table in `src/model/society/titles`, runtime wiring in `src/model/history/sim/engine/state/titles.ts`, initial setup in `src/model/history/sim/nations/index.ts`.

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

- Settling has two steps. The realm is the owner (sovereign) with a strict majority of the region's provinces. The holder is a ruler inside that realm: the sovereign itself or a vassal ruler granted the title by `VASSALAGE`. A demesne lookup stays inside the province's own realm.
- The holder also needs at least the tier's minimum size, capped at the region's total size.
- If no owner qualifies, the title is vacant (`holder = -1`).
- A holder change emits a `title passed` event.

Seat rule: the seat must be inside the region and owned by the holder. If not, it moves to the holder's best province in the region, ranked by `seatRank * 1000 + seatScore`. That emits a `capital moved` event with cause `title passed` or `seat lost`.

There is no hysteresis. The previous keep/challenge thresholds (holder keeps at 50%, challenger needs 25% and more than the holder) were removed, so control can flip as soon as another owner has a strict majority.

## Founding and dissolving (`FOUNDING`, `considerTitles`)

Only kingdom, empire and hegemony can be founded. A nation tries at most one tier per call, lowest first.

A nation can found a title at tier `T` when:

- It holds at least 2 tier `T-1` titles that it fully owns and that aren't already inside a fully held tier `T` region (`orphansOnly`).
- Its wealth is at least the lower quartile of current holders at tier `T` or higher.
- A roll passes: 2% + 2% × leader claim.

Founding merges those children's provinces into a new region, writes the new title into `regionOf` at tier `T` and all higher tiers, and picks the seat: the holder's root province if it's inside the region, otherwise the holder-owned province with the best rank and `seatScore`. It emits `title created`, re-settles the titles it replaced, and relinks the nation.

A founded title lapses when the nation holds fewer than 2 fully held children for 25 years (`LAPSE_YEARS`). It then emits `title destroyed` and the region is cleared. Generated titles never dissolve.

## Nation vs its subordinates

- A nation is a sovereign realm. Its id is its root province id, so relations, leaders and wars are indexed by it.
- Duchy-and-above titles can be held by vassal rulers. A ruler's id is the seat province of its highest title (`RULER.reseat` moves its leader state and rewrites `titles.holder` when that changes), so a sovereign's id never moves and a vassal that breaks away becomes a nation with the same id and keeps its person (`RULER.releaseMode`).
- Counties are not held separately. Provinces that hold no title seat get only a `parent` link, derived from held titles.
- Succession law (`confederate`, `partition`, `high_partition`, `single_heir`) is per sovereign and drawn by `SUCCESSION_LAW`; the heir comes from `HEIRS.of`, which reads the kin graph when people exist. When a vassal line ends, its titles revert to the liege; an independent line gets a new ruler with a new dynasty.

## Derived liege tree (`DEJURE.deriveParents`)

`parent` is recomputed from ownership and seats. It is never written ad hoc.

For a province `p` in nation `N` with root `R`:

1. If `p` is the root, it has no parent.
2. Walk tiers 1 to 4 and look at the title whose region contains `p`. Skip vacant titles.
3. The liege is that title's seat if the seat is not `p`, is owned by `N`, and has a higher `seatRank` than `p`.
4. If no tier gives a liege, the parent is the root `R`.

`seatRank` of a province is the highest tier of any held title seated there. It's how a duchy seat becomes the liege of its member provinces, a kingdom seat the liege of its duchy seats, and so on up to the root.

Rules to keep the hierarchy valid:

- Go through `settleProvinces` / `applyDerivedParents`. Parent writes must go rank-descending, or the `FIELDS.prov.parent.set` cycle check throws.
- `applyDerivedParents` covers the members of a nation, excluding desolate provinces.

## Comparison with CK3

Similar:

- Tier ladder county → duchy → kingdom → empire, with hegemony added.
- Fixed de jure regions, separate from de facto holdings.
- Each title has a capital seat, and titles are created by holding enough of the tier below.
- Realm hierarchy follows the seats of held titles.

Different:

- Realms are chosen by majority ownership. Vassal holders come from generated grants and succession division, not from vassal contracts, and there is no usurpation or county-level holder.
- The liege tree is derived, not chosen.
- No de jure drift. The tree changes only when titles are founded or dissolved.
- Founding is a wealth-gated random roll instead of a decision with a cost.
- Titles can be vacant.
- No barony tier below county.

## Known drift

Nations consolidate more than before the title layer: about 1023 → 826 over 100 years. See the deviations section of `plans/dejure-title-layer.md`.

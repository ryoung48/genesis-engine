# Navies and naval warfare

Scope: `:history`. Code: `engine/military/navy` (`NAVY`), with the budget split in `engine/military/recruitment`, naval engagements in `engine/military` (`MILITARY.fightNaval`) and `engine/events/battle`, and blockades in `engine/events/siege`. See [armies, battles and war settlement](armies-and-wars.md) for the land rules these extend.

Every sovereign spends part of its readiness budget on a fleet of whole ships. Fleets commit to wars beside troops, fight naval engagements, and decide whether a besieged port is fed by sea. There are no landings, raids, commerce raiding, hired fleets, storms or sailing seasons.

## Ports and reach

A province is a **port** when `provinceWaterBody[p] ≥ 0`: the largest water body (sea or lake) its coast touches, taken from the generated `settlementWaterLandmarks`. Earth imports carry no such data, so they have no ports and no navies.

A realm's ships **reach** a water body when it owns at least one port on it. Ships belong to the realm and are committed to wars, never to a province or sea. An engagement or blockade uses only committed ships of realms that reach the water body concerned. A lake fleet reaches only its lake.

## Naval share and whole-ship targets

For each sovereign, over its realm provinces:

- `S` is the share of provinces that are ports.
- `L` is the share of provinces adjacent by land to a province of another sovereign whose relation is `NONE` or `WAR`. Allies, subjects, overlords, union partners and colonies do not count.

```text
naval share  = 0.35 × S / (S + L)             (0 when S = 0)
navy money   = naval share × funding(knowledge) × B
ship price   = 2 × crew(knowledge) × 200 g × price scale    (home upkeep, crew plus hull)
sailor pool  = 0.01 × coastal manpower
target ships = min(floor(navy money / ship price), floor(sailor pool / crew(knowledge)))
army budget  = B − target ships × ship price / funding(knowledge)
```

Crews come only from port provinces. Coastal manpower is the realm's [manpower](armies-and-wars.md#enrollment-and-recruitment) summed over its ports, so each port also counts less the farther it is from the capital. The sailor pool is separate from the army's safety ceiling: coastal seafarers and inland levies were largely different people, so sailors are not counted against it. Navy money the sailor pool cannot crew stays in the army budget.

`B` is the existing readiness budget (`0.75 × max(0, civilian surplus)`), `funding` the existing piecewise from 10% at knowledge 0.42 to 90% at 2.38, and the price scale the existing `(output per resident / 450)^0.5 × ducats per gram`. The army runs its levy and regular logic on `army budget`, so it loses exactly what the navy buys: regular spending plus whole-ship home upkeep equals the regular spending without a navy. A budget too small for one ship goes to the army. Exposure is cached per realm and refreshed when the hierarchy or any relation changes. Rebellion previews apply the same split to each prospective territory; a province outside the previewed territory that shares its current sovereign counts as hostile, because it becomes a separate realm.

## Ships, crews and upkeep

| Knowledge | 0.42 | 1 | 1.44 | 2.38 |
| --- | ---: | ---: | ---: | ---: |
| Crew per ship | 60 | 200 | 250 | 375 |

Crew interpolates linearly and uses the realm's current knowledge. Each crew member has combat strength 1, as a regular does: a fleet's strength is whole ships × crew.

`state.shipsCurrent` holds fractional build progress `h`. The fleet that exists, fights and is billed is `round(h)` whole ships. `h` recovers toward the target through the same exponential rule as regulars at 0.25 per year, in peace or war, so the first ship of a build from nothing is delivered after `ln 2 / 0.288 ≈ 2.4` years. The money for unbuilt ships is saved, not passed to the army. When the target falls below `round(h)`, `h` drops to the target at once and each ship removed counts as a decommission. A target that wobbles around an integer boundary can therefore decommission and rebuild ships; the report counts it. Initial fleets start at their full target.

Billing is `2 × crew × 200 g` per ship-year at home and `2 × crew × 625 g` on campaign, times the price scale: the crew at regular-soldier prices plus an equal hull upkeep for construction, repairs and stores. Hulls are charged as continuing wear and tear, the way Parliament voted them, rather than as a one-time purchase. Upkeep integrates whole ship-years over the same peace and campaign intervals as troops, charges at tax settlement into `navalExpenses`, and shows as its own "Navy maintenance" treasury row. Pending naval upkeep counts against a participant's cash like pending army upkeep.

## War commitment

Each participant commits whole ships to each war: its whole fleet times the war's opponent-weighted `war.allocation` fraction, rounded by largest remainder so a nation's commitments sum to its fleet. They live in `war.ships`, are recomputed whenever the realm's military refreshes after a rebalance or a fleet change, and are dropped when the nation leaves the war. Ships committed to a war pay the campaign price. A side's ships are its members' committed ships; the army's square-root attendance rule models foraging and does not apply at sea.

## Naval engagement

A naval engagement is a battle `kind: "naval"` chosen like the field kinds.

| Rule | Value |
| --- | --- |
| Eligible | The war's target province is a port and each side has at least one committed ship that reaches its water body. |
| Weight | `0.90 × c`, `c` the mean port share `S` of the two war leads. Takes part in the same normalization as river crossing, with no terrain and no kind multiplier. A siege stays at 95% when eligible. |
| Resolution | The field resolver with ship-strength coalitions: each reaching member enters with `levy` 0 and `regular` = ships × crew. Base losses `N × 0.10 × share^1.5`, deployment shortfall 0, the land rout chance, pursuit 30–70% of what remains of the routed side. |
| Ship losses | A side's loss `x`, scaled to its ships, becomes `floor(x)` ships plus one more with probability `x − floor(x)`. Lost ships are split among members by committed ships. |
| Crew deaths | 40% of the lost ships' crews die, taken from rural population through the same path as soldier casualties. |
| Conquest | `CONQUEST.apply` with `occupies: false`: no occupation, restoration, plunder or sack. The war score receives half the loser's loss share. Settlement checks, endings, delay and initiative run as for a land battle. |
| Location | Off the coast of the war's current target province, on its water body. Nothing in the province changes. |

The `battle` record carries `kind: "naval"`, the province, `waterBody`, ships and crews per side, ships lost and crew deaths. Timelines say "in a naval battle off the coast of <province>". If an engagement finds a side with no ship in reach it is refused and counted as a reach violation; the history report requires zero.

## Sea supply and blockade

`Siege.seaSupplied` is set when a siege begins. For a port target it starts `false` (blockaded) when the besiegers have at least one committed ship that reaches the port's water body and the defenders have none; otherwise it starts `true`. Non-port targets have `seaSupplied = false`. A port town is fed by ordinary shipping, which needs no fleet; only a blockading fleet stops it.

While supplied, modified siege rolls of 10–13 (supplies and food shortages) are stalemates. Water shortage still happens, because wells and cisterns are inside the walls. Shortages already recorded stay.

After relief each phase can add one beat, 10% chance:

| Beat | Trigger | Effect |
| --- | --- | --- |
| `blockade imposed` | Supplied; the besiegers have a reaching committed ship. | Uncontested if the defenders have none; otherwise a naval engagement with the besiegers attacking. A non-inconclusive besieger win blockades the port. |
| `blockade broken` | Blockaded; the defenders' reaching ships are at least 50% of the besiegers'. | A naval engagement with the defenders attacking. A non-inconclusive defender win restores supply. |

At the start of each phase a blockaded siege whose besiegers no longer hold a reaching committed ship returns to supplied. Blockade engagements apply ship and crew losses but add nothing to the battle score, like every other siege beat. The `siege started` record carries `seaSupplied`, `waterBody` and the reaching ship counts; timelines show how the siege began and each blockade beat.

## Threat

`MILITARY.threat` adds each side member's fleet strength (whole ships × crew, divided across its current wars as troops are) to its attended troop force before the cubed share. Ships count wherever the war would be, with no water-body check. A crew member fights at regular strength but costs twice a regular once the hull is paid for, so moving money from regulars to ships buys about half the threat: a navy is the costlier way to buy force. War declarations, peaceful annexation and alliance checks, buy-off and indemnity chances, and interregnum targets inherit it. A rebellion preview gives the crown and the rebels the ships each would hold after splitting the overlord's current fleet by port-province count. Strength exhaustion, the `no troops` ending and the rule that an unarmed realm cannot join a war stay troop-only.

## Realm changes

- **Annexation.** The fleet and war commitments disappear (peace terms, peaceful annexation, any other loss of sovereignty).
- **Splits.** Rebellion and faction release, partition, interregnum and cut-off districts divide the old realm's whole ships among it and the new realms by port-province count, largest remainder. New realms start at their share; the old realm keeps `h` minus the ships given away, with its fractional part. Each then builds or decommissions toward its own target.

## Record and reports

Census snapshots carry each realm's whole ships; naval upkeep is the `navalExpenses` budget row. The nation page shows a "Ships" figure and the "Navy maintenance" row. `pnpm report:history` adds a per-window `navy` section: naval share of military spending (mean and p10/p50/p90 over coastal realms), the share of realms with ships, ships per realm, naval upkeep over revenue, engagements (count, share of battles, outcome mix), ships lost and crew deaths, port sieges split by start state and defender fleet, decommissions, reach violations and blockade beats.

## Constants

| Constant | Value | Basis |
| --- | --- | --- |
| Naval share cap | 0.35 | The most naval power, Britain, spent about 20–36% of military money on the navy; the Seven Years' War navy took about a quarter of war spending. A Britain-like realm (S 0.7, L 0.05) gets 31%, a France-like realm (S 0.3, L 0.25) 13%, consistent with the French navy's 5–6% of the state budget, 1715–1789. |
| Land-border weight | 1 | **Assumption.** A land invasion cannot be avoided, while a sea threat can be waited out. Lowered from 2 so port-heavy realms with land neighbours still build ships. Checked by the naval-share distribution in the report. |
| Crew curve | 60 / 200 / 250 / 375 | 867: longships carried 30–80 men, 60–70 typical for war. 1300: Michael of Rhodes' war galley (1401) about 215 men. 1500: the Armada about 29,500 men on about 130 ships. 1800: 120,000 men voted for about 320 ships in commission in 1805. |
| Sailor share | 0.01 of coastal manpower | The Royal Navy's peak, about 113,000 seamen and 31,400 marines (138,000 active in 1813), was about 0.9% of the roughly 16 million people of Britain and Ireland in 1801; it is the highest naval share of the sailing era. By the 1780s the British and French fleets already needed all the seamen their countries had (Frykman 2009), and the Dutch could crew only two-thirds of theirs in 1780–1784, so the limit is the seafaring population, not money. France's maritime registry (classes, 1668–1670) called one class in about three each year and classed 16,000–17,000 sailors a year in 1756–1760. All of Britain counts as coastal, so 1% of coastal manpower sits just above its peak. |
| Hull upkeep | 1 × crew pay | Parliament voted navy money per man per month in heads: wages, victuals, wear and tear (hulls, repairs and building) and ordnance. Wear and tear alone was about £3 per man per month by 1808 against victuals of 19s (Commons, 3 February 1809), ordnance was 7s in 1820, and the whole rate rose from £4 in the 1660s to about £7, so hull and guns took roughly half of the navy's money. A 74-gun ship cost about £44,000–50,000 to build in 1789–1793 (£62,000 in 1816), about a year of its roughly 590 men's pay at £81 each. Any value from 0.7 to 1 is defensible from these mixed-year figures. |
| Crew prices | 200 g home, 625 g campaign | The existing regular prices. A sailor at sea cost about 2.7× a soldier at home (£81 against £25–35 a year), close to the existing 3.1× campaign/home ratio. |
| Build rate | 0.25 per year | A 74 took about 3 years from laying down to launch and about 4 from order; France grew from about 23 to about 196 ships in about 10 years under Colbert. |
| Naval kind weight | 0.90 × c | **Assumption.** Raised from 0.30 to move the naval share of battles from 1.2–2.1% to 2.7–7.3%. Wikipedia's battle lists give roughly 4–10% by century (10th–18th), a crude count that mixes sieges and uneven coverage. A port town that is siege-eligible still takes 95% of selections, so the weight mostly acts on ports that are not towns. |
| Naval base loss | 0.10 × share^1.5 | Half the land scale with the land exponent: about 3.5% per side in an even fight, matching Ushant 1778, Chesapeake 1781 and Gravelines 1588. |
| Naval rout pursuit | 30–70% of what remains | A routed loser loses 34–72% in total, bracketing Trafalgar and Lepanto. |
| Crew death share | 0.40 | Trafalgar about 25% of the lost ships' crews, Lepanto about 55%. |
| Naval score weight | 0.5 | **Assumption.** At full weight a defender's battle part could win a war at sea alone. Checked by the war-ending mix. |
| Blockade beat chance | 0.10 per phase | **Assumption.** Mirrors siege relief (0.06), higher because a fleet already present is easier to commit. |
| Break threshold | 0.5 of besieger ships | **Assumption.** Mirrors relief's 0.25 strength threshold, doubled because a fleet must face the blockaders directly. |
| Shortages suppressed when supplied | Supplies, food | Sea supply replaces both; water stays. |

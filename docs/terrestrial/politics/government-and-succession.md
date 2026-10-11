# Government, rulers and succession

Scope: `:history`.

Government determines how rulers are chosen and titles pass between [rulers](rulers-and-dynasties.md): each sovereign realm has one ruler and nothing else is simulated about the ruling house. [Title hierarchy](title-hierarchy.md) defines the ranks and territorial title structure.

Code: types, families and the era mix in `src/model/society/eras`; assignment, succession system and partition gate in `src/model/history/sim/nations/government`; succession in `src/model/history/sim/engine/events/succession` (`systems/`, `partition/`, `interregnum/`, `regency/`, `coronation/`); rulers in `src/model/history/sim/engine/state/rulers`.

A realm's government decides how it passes on, whether it marries for alliance, and whether it is divided among heirs. It is read from the realm's root province.

## Government types

[Government changes](government-change.md) describes runtime review moments and transitions.

| Family | Type | What it is | Succession | Partitions | Marries for alliance |
|---|---|---|---|---|---|
| Tribal | chiefdom | A small realm under one chief. | Partition | Yes | Yes |
| | tribal monarchy | A tribal kingdom held by one house. | Partition | Yes | Yes |
| | tribal federation | A league of tribes that chooses its leader. | Election | No | Yes |
| | native council | A small council-led people. | Election | No | Yes |
| Monarchy | feudal monarchy | A crown over hereditary lords. | Single heir | No | Yes |
| | elective monarchy | A crown the great lords elect. | Election | No | Yes |
| | absolute monarchy | A centralized crown. | Single heir | No | Yes |
| | constitutional monarchy | A crown bound by law. | Single heir | No | Yes |
| | warlord state | A realm held by a military strongman. | Appointment | No | No |
| Republic | oligarchic republic | A city or league ruled by its leading houses. | Election | No | No |
| | dynastic signoria | A former republic under a princely lord. | Single heir | No | Yes |
| | peasant republic | A lord-less commune of free peasants. | Election | No | No |
| | pirate republic | A small, remote coastal haven. | Election | No | No |
| | presidential republic | A republic under an elected president. | Election | No | No |
| | parliamentary republic | A republic led by its parliament. | Election | No | No |
| | socialist state | A one-party state. | Appointment | No | No |
| | military junta | Rule by officers. | Appointment | No | No |
| | fascist state | A totalitarian nationalist regime. | Appointment | No | No |
| | dictatorial rule | A personalist autocracy. | Appointment | No | No |
| Theocracy | theocracy | Rule by the clergy. | Appointment | No | No |
| | monastic state | A small state of a religious order. | Appointment | No | No |
| | imperial cult | A large realm whose ruler is sacred. | Single heir | No | Yes |
| Colonial | trading company | A chartered company's territory. | Appointment | No | No |
| | settler colony | A colony of settlers. | Appointment | No | No |

- **Succession** is Single heir, Partition, Election or Appointment by government.
- **Partitions** is `GOVERNMENT.partitionsOfIndex`: `tribal_monarchy` and `chiefdom` only. Partition is single-heir succession plus a division: the heir roll is the single-heir one and junior heirs then take districts. In code their system (`GOVERNMENT.successionOfIndex`) is still `single_heir`.
- **Marries for alliance** is `GOVERNMENT.marriageAlliancesOfIndex`: single-heir realms and elections outside the republic family.

## Assignment

Procedural nations are placed largest first and grow contiguously. Targets below 10 provinces receive the existing water-access preference for capital selection and frontier claims. Targets of 10 or more receive no water-access bonus in either step; they can still claim coastal land through habitability, available space and proximity. The cutoff reuses the placement algorithm's existing lower boundary for large-nation continent preference and the 10–24 province size bucket. Government assignment still uses water access for every eligible size.

Seed placement uses a reproducible weighted draw over active, unclaimed provinces, preferring connected components that can accommodate the target size and falling back to smaller components only when none can. Placement scores determine selection probabilities rather than guaranteeing the highest-scoring location. Habitability's contribution to seed and frontier scores decreases linearly from full weight at 10 provinces to half weight at 50 provinces and above. The late-migration seed penalty follows the same size ramp, reaching a maximum of 17.5%. These reductions halve the previous large-nation biases so fertile, early-settled regions are less consistently consumed first. The continental preference is retained. Imperial Patchwork and Trade League member placement use the same weighted seed selection.

Each nation draws its type once, at world generation (`GOVERNMENT.assignGovernmentType`).

1. **Family weights.** The era's government mix is blended with a prior by nation size. The era's `governmentSizeWeight` sets the blend: 1.0 in the earliest era (size alone), 0.55 in the late medieval era, 0.15 in the information age (the era mix alone).

   | Provinces up to | Tribal | Monarchy | Republic | Theocracy |
   |---|---:|---:|---:|---:|
   | 1 | 0.72 | 0.12 | 0.12 | 0.04 |
   | 4 | 0.55 | 0.26 | 0.12 | 0.07 |
   | 9 | 0.28 | 0.52 | 0.10 | 0.10 |
   | 24 | 0.10 | 0.64 | 0.10 | 0.16 |
   | 49 | 0.03 | 0.72 | 0.08 | 0.17 |
   | 99 | 0.01 | 0.77 | 0.07 | 0.15 |
   | more | 0 | 0.82 | 0.08 | 0.10 |

   The size prior's tribal share fades as stateless land disappears, over the last 30% of state coverage. Premodern eras keep part of it.
2. **Modifiers**, each scaled by the size weight except the migration wave:
   - *Water access* at the capital raises republic, at the cost of tribal and monarchy.
   - *Habitability* below 0.35 raises tribal.
   - *Migration wave.* Realms near the settlement frontier lean tribal; realms of long-settled cores lean monarchy, republic and theocracy.
3. **Size caps.** A nation above the era's `maxRepublicSize` or `maxTheocracySize` (40 provinces each in the late medieval era) cannot draw that family.
4. **Draw.** The weights are clamped at zero and normalized, and the family is drawn from a hash of the seed and the nation index. Trade-league cities never draw tribal.
5. **Subtype**, from a second hash:
   - *Tribal.* 10+: tribal federation 55%, tribal monarchy 45%. 5–9: tribal monarchy. Smaller: chiefdom or native council, with the council more likely on harsh or frontier land.
   - *Monarchy,* by era. Ancient: feudal by default, elective for 5+ provinces 75% of the time, absolute for most realms of 20+. Late medieval: feudal by default, elective for mid-size realms, absolute only for a fifth of realms of 20+. Early modern: absolute and elective for 8+, feudal still common, a few constitutional. Industrial: constitutional and absolute, some warlord states. Information age: constitutional, with a few absolute holdouts.
   - *Republic.* Before the industrial era: oligarchic by default, dynastic signoria for a quarter of long-settled cores, peasant republics among realms of 4 or fewer, a few pirate republics on small coasts. Later eras draw parliamentary, presidential, juntas, and (by era) fascist, socialist and dictatorial regimes.
   - *Theocracy.* 20+ provinces before the industrial era: imperial cult 45% of the time. Small coastal realms: monastic state 55%. Otherwise theocracy.

Government belongs to the realm and is read at its root province. New realms inherit their former sovereign's government, then undergo a [founding review](government-change.md).

## Succession

The government type picks the system (`GOVERNMENT.successionOfIndex`). A succession is one roll per system (`SUCCESSION_SYSTEMS.choose`) that fixes the new ruler's house, claim and age table together; the ruler is then sampled from that outcome. All rolls use the history RNG. See [rulers and dynasties](rulers-and-dynasties.md) for the ruler record, age tables and unions.

**Single heir** (feudal, absolute and constitutional monarchy, dynastic signoria, imperial cult, and the partitioning chiefdom and tribal monarchy). One roll picks who inherits:

| Outcome | Chance | House | Claim |
|---|---:|---|---:|
| Son | 0.75 | same | 3 |
| Daughter's line | 0.19 | other | 3 |
| Brother's line | 0.035 | same | 2 |
| Distant kin | 0.015 | same | 1 |
| No heir | 0.01 | new | 0 |

The chances assume a sovereign's sons and daughters are independent Poisson counts with mean ln 4, so that a quarter of reigns leave no surviving son, the failure fraction McFarlane (*The Nobility of Later Medieval England*, 1973) finds for peerage families per 25 years; the collateral lines repeat that proxy. The figures are rounded to sum to 1. They are an assumption transferred from peerages to sovereigns, not a measurement, and the report's `succession` fields are the check. On the person model a child inherited in 85% of successions (94% here), the house was kept in 77% of inheritances (80% here) and no heir occurred in 6.9% (1% here); that model generated houses only a few generations deep, so distant kin rarely existed.

Every heir draws an `INHERITED_AGE`; a new house, from no heir, draws a uniform 20–50. House `other` means the crown passes through a [royal marriage](royal-marriages.md#in-succession): a random tied partner's own ruler takes the throne and the realms unite (chance 0.20, when they can), or a new ruler of the partner's dynasty does; without a tie, a new dynasty.

A succession is **disputed** when the heir is under 16 or the crown passes to a daughter's line.

**Election** (elective monarchy, tribal federation, native council, republics). With chance 0.568 (1,546 of 2,724 elected rulers on the person model) the late ruler's house keeps the crown, else a new dynasty. Claim 2 and an `ELECTED_AGE` draw either way. An election always elects.

**Appointment** (theocracy, monastic state, warlord state, trading company, settler colony, modern regimes). A new dynasty at a uniform 20–50 age. In a realm with a district the ruler is a notable with chance 0.293 (22 of 75), claim 1; otherwise claim 0.

**Claim**, by how the ruler took the throne, feeds title founding and weak-crown rebellions:
- 3: a son, a daughter's line, a pretender, a founder and a junior heir who received a realm in a partition;
- 2: a brother's line, an elected ruler, a ruler of a union that ended;
- 1: distant kin, an appointed notable, a usurping kinsman;
- 0: a new house, a lord protector, or the crown-land ruler after an interregnum.

**Order within one succession.** The deceased ruler's columns, the dynasty and the eligible tied partners are snapshotted. The outcome is chosen and any new ruler sampled from the snapshot; an interregnum, if rolled, frees its districts; the successor is installed with union and tie consequences; then partition runs, then the revolts if the realm was not divided, then the government review and the coronation. Heap events scheduled by the new rulers belong to the final arrangement of any union.

**Pretender revolts.** Rolled for a disputed inheritance or any election, in a realm with at least one district seat, never in a republic and never when the succession divided the realm or broke it up. An adult heir of the house faces none.

| Constant | Value | Source |
|---|---:|---|
| Pretender, disputed inheritance | 0.34 | 435 pretender seats in 3,076 inherited successions with a district (0.14) on the person model, assumed to fall on the disputed ones, which are `1 − 0.72 × 0.81 = 0.417` of inheritances |
| Pretender, election | 0.073 | Person model, kept as measured |
| Each other district joins, inheritance | 0.59 | 1,285 of 1,483 other held districts joined (0.866), times the held share 472 / 697 |
| Each other district joins, election | 0.30 | 78 of 175 (0.446), times the same held share |

The most populous district leads the revolt and each other district joins with the chance above; the rebel ruler has the late ruler's dynasty after an inheritance and a new dynasty after an election, claim 3. Kokkonen and Sundell (*Delivering Stability*, 2014) find for 961 European monarchs, 1000–1800, that a monarch's death raised the risk of civil war and that a living adult male heir lowered it; only that direction is used. The war rules are in [rebellion](rebellions-and-throne-wars.md). When no pretender rises, the [weak-crown](rebellions-and-throne-wars.md#triggers) check runs.

A tied partner may also press the claim of a minor's crown by war; see [foreign claims](personal-unions.md#foreign-claims).

## Partition

Chiefdoms and tribal monarchies treat the realm as the dynasty's patrimony, as in the Frankish divisions of 511 and 843, Kievan Rus' after 1054 and Poland's testament of 1138. When a son inherits, junior heirs exist with chance 0.54 (a second surviving son given a first, from the same Poisson counts as the heir table); their number is 1 to 5 with weights 594, 275, 96, 27 and 8 (Poisson(ln 4) probabilities of 2, 3, 4, 5 and 6 or more sons over the chance of two or more). The mean is 1.6 junior heirs. On the person model 82.7% of child successions had junior heirs, 2.5 on average and up to 11. `PARTITION.divide` receives the count, called from the succession event once the primary heir holds the throne.

**Shares.** Junior heirs first take surplus top-tier titles, ordered by owned population in the title region and then seat id. The primary keeps the title containing the capital, or the first title if none contains it. A title share carries its crown land and every district seated inside its region, each district whole. Attached land outside that region leaves with an inside district; inside land attached to an outside district stays with that district. Crown land inside the title always leaves.

Remaining junior heirs take one titled district each, best rank and population first, excluding districts already allocated with title shares. County districts never form shares. The root and every supporting seat move before title settlement, so temporary ownership cannot move a title onto a seat. Every share is rechecked for ownership and occupation before release. Realms with no surplus title and no titled district have nothing to divide.

Each seated junior founds a realm of the late ruler's dynasty with claim 3 and an `INHERITED_AGE` draw; a child gets a regency.

**Cut-off land.** Before freeing anything cut off, partition joins each piece to a bordering heir realm whose top tier is equal to or above the piece's own rank. Highest top tier, then population and seat id decide ties. Occupied pieces do not join. Remaining cut-off land is released by the existing connection repair.

**No succession revolt.** A succession that creates at least one heir realm starts no pretender revolt and no weak-crown revolt. A succession that creates none keeps both. The yearly rebellion check and regent usurpation are unchanged.

**Notes.** Every succession of a partitioning realm writes one note:
- `partition skipped`, with the reason `no junior heir` or `no free seat`;
- `partition`, with the late ruler, the primary and the heirs as ruler snapshots, the seats, every resulting realm's kind (`primary`, `heir`, or `released` for cut-off land that went independent), population, province count and top tier, the districts that joined an heir realm, the shares that received nothing and why (`no seat`, `share dropped`), and the titles left without a holder.

The history report's `partition` section is built from these notes (`src/test/history-run/report/partition`).

## Interregnum

Code: `src/model/history/sim/engine/events/succession/interregnum` (`INTERREGNUM`, called from the succession event).

**Gate.** A single-heir realm (including the partitioning governments) whose succession rolls no heir and that has at least one district seat breaks up with chance 0.34 (27 of 79 such successions on the person model). Elections, appointment and a heirless realm with no district seat are unchanged.

**Sequence.**
1. A snapshot records every district seat (ascending seat id) and every top-tier title of tier duchy or above the realm holds.
2. `STATE.releaseFactions` frees all snapshot seats in one batch, so each freed realm owns exactly the provinces its seat owned at the moment of death. Each takes the realm's government and a ruler of a new dynasty with claim 3 and a uniform 20–50 age.
3. The snapshot titles are destroyed at once, with no 25-year wait. Counties are never destroyed. Every sovereign that owned land of a destroyed title, held it, or was freed is relinked, so ranks and districts are current.
4. Crown land the releases cut off from the root goes independent through the connection repair.
5. The original nation keeps the one-tier-below titles around its capital and the destroyed titles' seats, the loose land attached to them and vacant district seats. A new house (claim 0) rules it.
6. Each freed realm, in ascending id, declares a conquest war on the bordering freed realm with the lowest threat (ties to the lower id), skipping truces and ties; a realm already attacked declares nothing.

The succession starts no pretender or weak-crown revolt, as with a partition. The `interregnum` note records the late ruler, the crown's new ruler, the freed seats and their rulers, skipped seats, cut-off provinces, wars and titles lost. Destroyed kingdoms and empires return through the [coronation](#coronation); destroyed duchies return as [recovered duchies](title-hierarchy.md#founding-and-dissolving-founding-coronationelevate).

## Districts

A district is a seat exactly one tier below its realm's top tier, outside crown land, answering directly to its sovereign (`state.districtSeat`). It has no holder: it rebels, joins a pretender or takes a share in a partition as a territory. The crown keeps all top-tier seats and the one-tier-below titles around those seats and the capital. Every district seat counts, whether or not anyone would have held it on the person model.

## Regencies

- **When.** A sovereign ruler under 16 is governed by a regency council (`state.regency`) until their sixteenth birthday, their death or a usurpation. There is no regent person and no incapacity regency.
- **Coming of age.** The end is queued for the ruler's sixteenth birthday when the regency starts. A ruler who has been replaced by then leaves it stale; otherwise a ruler who [acceded to the throne](#coronation) is crowned.
- **Weak crown.** A realm under a regency starts no wars and its districts rebel more easily ([rebellion](rebellions-and-throne-wars.md)). It still defends; diplomatic disposition governs subject calls.
- **Usurpation.** Each regency has a yearly chance of 0.0065 (57 usurpations over 8,798 regency-years on the person model) that its protector seizes the throne. With chance 0.93 (53 of 57) the usurper is a kinsman: the ward's dynasty, claim 1. Otherwise a lord protector founds a new dynasty with claim 0 and the weak-crown rebellion check runs. The usurper has a uniform 20–50 age. No deposed claimant is kept. A union junior can be usurped like any realm and leaves its union.

## Coronation

Code: `src/model/history/sim/engine/events/succession/coronation` (`CORONATION.hold`, `.holdDeferred`, `.elevate`).

A coronation is the ceremony, regalia and recognition of a ruler. The realm's own treasury pays. There are two kinds.

**Accession coronation.** Held when a new ruler takes the throne of a realm that already exists and is still sovereign afterwards: by succession, usurpation or regime change, under every government type. It is held once the throne is settled, after any partition, revolt and government review. Lapsed founded titles dissolve at this point, and the realm may found one title (including a recovered duchy) [at or below its own rank](title-hierarchy.md#founding-and-dissolving-founding-coronationelevate); a title above it waits for an elevation.

Not crowned: rulers of realms created at that moment (partition heirs, breakaway and pretender realms, released provinces), the first rulers at world start, and a union junior that merges into its senior.

**Under a regency.** No coronation is held while a council governs. A child who took the throne by one of the accessions above is owed a coronation and is crowned on coming of age at sixteen, at that day's treasury and rank. One who is replaced first is never crowned. A first ruler or a partition heir who starts under a regency was never owed a coronation and gets none.

Deferral to majority is the simpler of the historical practices (Louis XIV acceded at four in 1643 and was crowned at fifteen; Henry VI of England acceded as an infant in 1422 and was crowned at seven; Henry III was crowned at nine within weeks of acceding in 1216).

**Elevation coronation.** Held when a sitting ruler [founds a title](title-hierarchy.md#founding-and-dissolving-founding-coronationelevate) above the realm's rank in the yearly pass. It needs no change of ruler. It must be at least customary at the rank it is priced at, and it is held only if the title is actually created.

**Reference fee.** Every rank has one reference price: `625 / 288` ducats per province times the rank's minimum size.

| Rank | Minimum provinces | Reference fee (ducats) |
| --- | ---: | ---: |
| County | 1 | 625 / 288 (about 2.170139) |
| Duchy | 2 | 625 / 144 (about 4.340278) |
| Kingdom | 8 | 625 / 36 (about 17.361111) |
| Empire | 40 | 3125 / 36 (about 86.805556) |
| Hegemony | 180 | 3125 / 8 (390.625) |

The price rank is the realm's top tier. For an elevation it is the founded tier, which is the realm's new rank: a ruler who founds a kingdom pays a king's coronation.

The rate is the kingdom price divided by the kingdom's minimum size. Prices that double per rank, as CK3's do, grow more slowly than minimum realm size (×2, ×4, ×5, ×4.5), so the fee would become relatively cheaper with rank; scaling by minimum size keeps it roughly proportional to the smallest realm that can hold the rank. The fee is flat within a rank: an empire of 179 provinces pays what one of 40 pays.

These are accepted gameplay calibration prices, not measured medieval coronation tariffs. The kingdom anchor comes from the [mirrored CK3 title defines](https://github.com/jesec/ck3-mod-base/blob/master/base/game/common/defines/00_defines.txt#L913-L937), which give a base price of 500 gold for a kingdom. The [army defines](https://github.com/jesec/ck3-mod-base/blob/master/base/game/common/defines/00_defines.txt#L617-L629) give 0.003 gold per soldier; [military localization](https://github.com/jesec/ck3-mod-base/blob/master/base/game/localization/english/gui/militaryview_l_english.yml) identifies levy upkeep as monthly. Matching 0.036 gold per levy-year to this model's 62.5 g silver campaign levy-year at 450 g output per resident-year gives 15,625 / 9 g silver per CK3 gold. With `ECONOMY.ducatsPerGram = 1 / 50,000`, the fixed conversion is 5 / 144 ducats per gold, and 500 gold is 625 / 36 ducats. The empire and hegemony fees no longer correspond to CK3's 1,000 and 2,000 gold; they follow this model's tier sizes. Future military upkeep changes do not change these fees.

Equivalence of soldiers, service duration, equipment and provisioning between the two upkeep models is unverified. There is no demonstrated physical coin weight for a CK3 gold unit, so no additional bullion conversion applies. [John's 1199 chancery ordinance](https://sourcebooks.web.fordham.edu/source/1199Johnfees.asp), [Charles the Bold's ducal accounts](https://www.jstage.jst.go.jp/article/jsmes/8/0/8_26/_article/-char/en), and [Van Gelder's study of coronations and inaugurations](https://cris.vub.be/ws/portalfiles/portal/121350664/Van_Gelder_introduction.pdf) support expenditure on legal instruments, regalia, ceremony and political recognition at accession in particular settings. They do not establish universal rank tariffs or scaling by rank.

**Quality.** A coronation resolves to exactly one of five qualities, from the reference fee `B`, the posted treasury `T` and the [safe reserve](armies-and-wars.md#state-maintenance-and-treasury) `S` (two years of surplus). Equality is sufficient.

| Quality | Price | Held when |
| --- | ---: | --- |
| Magnificent | 4 × B | `4B ≤ T − S` |
| Lavish | 2 × B | else `2B ≤ T − S` |
| Customary | B | else `B ≤ T` |
| Humble | B / 2 | else `B / 2 ≤ T` |
| Uncrowned | 0 | otherwise |

The customary ceremony is an obligation paid from whatever cash exists; extravagance is paid only from cash above the safe reserve, which the treasury already treats as excess. Nothing is bought on credit, so a realm in debt is uncrowned. The ×2 steps keep each quality a clearly different outlay, and magnificent stays below the next rank's customary fee from kingdom upward.

**Payment.** The price leaves the treasury once and is recorded as the negative `coronationExpenses` [one-off budget line](armies-and-wars.md#state-maintenance-and-treasury). An uncrowned ruler pays nothing.

# Government, title holders and succession

Scope: `:history`.

Government determines how rulers are chosen and titles pass between [simulated people](../people/overview.md). A held seat is a person’s title; the primary seat ranks highest and guides [residence](../people/residence-and-realm.md), which is stored separately. [Title hierarchy](title-hierarchy.md) defines the ranks and territorial title structure.

Code: types, families and the era mix in `src/model/society/eras`; assignment, succession system and partition gate in `src/model/history/sim/nations/government`; succession in `src/model/history/sim/engine/events/succession` (`systems/`, `partition/`); heir lines in `src/model/history/sim/people/heirs`.

A realm's government decides how it passes on, whether its ruling house marries for alliance, and whether it is divided among heirs. It is read from the realm's root province.

## Government types

| Family | Type | What it is | Succession | Partitions | Marries for alliance |
|---|---|---|---|---|---|
| Tribal | chiefdom | A small realm under one chief. | Partition | Yes | Yes |
| | tribal monarchy | A tribal kingdom held by one house. | Partition | Yes | Yes |
| | tribal federation | A league of tribes that chooses its leader. | Election | No | Yes |
| | native council | A small council-led people. | Election | No | Yes |
| | steppe horde | A large nomadic confederation of arid land. | Election | No | Yes |
| Monarchy | feudal monarchy | A crown over hereditary lords. | Single heir | No | Yes |
| | elective monarchy | A crown the great lords elect. | Election | No | Yes |
| | absolute monarchy | A centralized crown. | Single heir | No | Yes |
| | constitutional monarchy | A crown bound by law. | Single heir | No | Yes |
| | warlord state | A realm held by a military strongman. | Appointment | No | No |
| Republic | oligarchic republic | A city or league ruled by its patrician houses. | Election | No | No |
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

- **Succession** is what the nation page shows (`GOVERNMENT.successionLabelOfIndex`): Single heir, Partition, Election or Appointment.
- **Partitions** is `GOVERNMENT.partitionsOfIndex`: `tribal_monarchy` and `chiefdom` only. Partition is single-heir succession plus a division: the primary heir is chosen by the single-heir rule and the junior heirs then take districts. In code their system (`GOVERNMENT.successionOfIndex`) is still `single_heir`, so marriages, unions and regencies work as in any single-heir realm.
- **Marries for alliance** is `GOVERNMENT.marriageAlliancesOfIndex`: single-heir realms and elections outside the republic family.

## Starting holder evidence

[Starting families](../people/families-and-lifecycle.md#starting-families) construct synthetic predecessor relations and accessions, then install all sovereigns before downstream initialization. Unknown predecessor tenure starts are [recorded evidence](../mechanics/person-records.md#initial-tenure-evidence), not reconstructed political history or inputs to historical marriage inheritance scoring. Adjacent cousin proposals precede diplomacy. District grants keep canonical score order and install each selected relative before the next grant; no starting personal unions are seeded. Ordinary later union formation and succession rules continue.

## Assignment

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
   - *Tribal.* 15+ provinces on poor land: steppe horde 40% of the time. 10+: tribal federation 55%, tribal monarchy 45%. 5–9: tribal monarchy. Smaller: chiefdom or native council, with the council more likely on harsh or frontier land.
   - *Monarchy,* by era. Ancient: feudal by default, elective for 5+ provinces 75% of the time, absolute for most realms of 20+. Late medieval: feudal by default, elective for mid-size realms, absolute only for a fifth of realms of 20+. Early modern: absolute and elective for 8+, feudal still common, a few constitutional. Industrial: constitutional and absolute, some warlord states. Information age: constitutional, with a few absolute holdouts.
   - *Republic.* Before the industrial era: oligarchic by default, dynastic signoria for a quarter of long-settled cores, peasant republics among realms of 4 or fewer, a few pirate republics on small coasts. Later eras draw parliamentary, presidential, juntas, and (by era) fascist, socialist and dictatorial regimes.
   - *Theocracy.* 20+ provinces before the industrial era: imperial cult 45% of the time. Small coastal realms: monastic state 55%. Otherwise theocracy.

**Stored per province.** Every province carries the government of the nation that owned it at world generation; land that began stateless carries chiefdom. Conquest does not update it. A realm released by rebellion or cut off from its crown therefore takes whatever its new root province carries, which can differ from the realm it left.

**The one runtime change.** A realm created by a partition takes the divided realm's government: its seat province is rewritten before it is released. Without this a district on once-conquered land would emerge under the government stamped at world generation and might never partition again.

## Succession

The government type picks the system (`GOVERNMENT.successionOfIndex`). Chiefdoms and tribal monarchies use the single-heir system to choose the primary heir, then divide:

| System | Governments | Rule |
|---|---|---|
| Single heir | feudal / absolute / constitutional monarchy, dynastic signoria, imperial cult | `HEIRS.of`. The heir may already rule elsewhere, which forms a personal union. With no heir, the strongest adult district holder takes it as a new house. |
| Single heir, then partition | chiefdom, tribal monarchy | The same rule picks the primary heir, who keeps the realm root; the other child lines take surplus titles, then titled districts, as new realms (see Partition). |
| Election | elective monarchy, tribal federation, native council, steppe horde, republics | See below. |
| Appointment | theocracy, monastic state, warlord state, trading company, settler colony, modern regimes | Half the time an adult of a district-holding house of the preferred sex, else a new house. |

**Elections.** See [district elections](#district-elections) for electors, nominations and voting.

**Claim**, by how the ruler took the throne, feeds title founding and weak-crown rebellions:
- 3: child or founder, a restored claimant, and a junior heir who received a realm in a partition;
- 2: sibling or elected;
- 1: other relative, appointed, or a usurping kinsman;
- 0: new house or lord protector.

**Disputes.** A single-heir succession is disputed when the heir rules elsewhere, is under 16, or is of the sex the culture passes over, and an adult of the preferred sex stands next in line.
- The district holders split between the heir and the rival. With at least 40% backing, and then with a chance equal to that share, the rival's district (or their strongest backer's) leads a revolt with the rival as pretender. Every district that backed the rival joins it.
- A losing election candidate who holds a district and won 40% also revolts.
- Otherwise the weak-crown rebellion check runs.
- None of these revolts starts at a succession that divides the realm (see Partition).

Disputed succession pretenders fight for the throne; a victory replaces the ruler. The war rules are in [rebellion](rebellions-and-throne-wars.md).

## Partition

Chiefdoms and tribal monarchies treat the realm as the dynasty's patrimony, as in the Frankish divisions of 511 and 843, Kievan Rus' after 1054 and Poland's testament of 1138. When their ruler dies with more than one eligible child line, the realm is divided (`PARTITION.divide`, called from the succession event once the primary heir holds the throne).

**Who the heirs are.**
- The primary heir is chosen as in any single-heir realm and keeps the realm root. Nothing is divided unless the primary is the late ruler's child or a descendant of one.
- Every other child line gives at most one junior heir (`HEIRS.line`): the child if alive, else the first living person of a dead child's line. A junior heir must not already be sovereign somewhere. A living child who is not eligible is not replaced by their own children, and never blocks another line.
- When any junior heir is of the culture's preferred sex, only those remain. Minors are included.

**Shares.** Junior heirs first take surplus top-tier titles, ordered by owned population in the title region and then seat id. The primary keeps the title containing the capital, or the first title if none contains it. A title share carries its crown land and every district seated inside its region, each district whole. Attached land outside that region leaves with an inside district; inside land attached to an outside district stays with that district. Crown land inside the title always leaves.

Remaining junior heirs take one titled district each, best rank and population first, excluding districts already allocated with title shares. An heir's own district is reserved only if it is still on offer. County districts never form shares. The root and every supporting seat move before title settlement, so temporary ownership cannot move a title onto an admin’s seat. Allocation is shared by projection and actual division; every share is rechecked for ownership, eligibility and occupation before release. Realms with no surplus title and no titled district have nothing to divide.

**Cut-off land.** Before freeing anything cut off, partition joins each piece to a bordering heir realm whose top tier is equal to or above the piece's own rank. Highest top tier, then population and seat id decide ties. Occupied pieces do not join. Remaining cut-off land is released by the existing connection repair.

**Displaced admins.** The shared [promotion and demotion rule](#districts) re-seats living admins before new grants. Partition uses the retained district rank and the same home-region and ordering rules as the yearly pass, with seat reason `partition`. District admins inside a title share keep their eligible seats.

**Regencies** start only when the seating is final: first for each new realm with a minor ruler, then for the primary realm, then one regency review so a regent of any other realm who has just become sovereign is replaced. A sibling who received a realm of their own is never a minor heir's regent.

**No succession revolt.** A succession that creates at least one heir realm starts no pretender revolt, no weak-crown revolt and no restoration revolt, and a deposed claim is not used up. A succession that creates none keeps all three. The yearly rebellion check and regent usurpation are unchanged.

**Notes.** Every succession of a partitioning realm writes one note:
- `partition skipped`, with the reason: `not child line`, `no junior heir` or `no free seat`;
- `partition`, with the heirs and their seats, every resulting realm's kind (`primary`, `heir`, or `released` for cut-off land that went independent), population, province count and top tier, the admins who moved and where, the districts that joined an heir realm, the heirs who received nothing and why (`no seat`, `reserved seat unavailable`, `share dropped`), and the titles left without a holder.

The history report's `partition` section is built from these notes (`src/test/history-run/report/partition`): how often realms divide and why not, how large the shares are, what happens to title holding, and what becomes of the heir realms.

## Attribute and trait effects

Election candidate strength gains `0.025 × (diplomacy - 5.5)`. Regent usurpation chance gains `clamp(1 + 0.125 × (intrigue - 5.7), 0.5, 2)` and a personality factor (Ambitious ×2, Content ×0). Restoration chance is multiplied by 1.5 for an Ambitious claimant and 0.5 for Content before the probability cap. See [attributes, traits and stress](../people/attributes-traits-and-stress.md) for the full rules.

## Held seats and primary title

Every person owns an independent sorted array of held seat IDs. `rulerOf` remains the authority for each seat; `PEOPLE.setRuler` and `PEOPLE.vacate` maintain both directions through `HOLDINGS`. Losing one seat preserves the others. The primary seat has the highest current title rank, with the lowest seat ID breaking ties. No primary seat is stored separately.

## Holder death scheduling

The engine schedules one death event per person with a finite death date, seat holder or not ([families](../people/families-and-lifecycle.md#death)). A sparse pending entry stores revision, due time, cause and pending/processing state. A living person whose death date is still unknown (`Infinity`) has no entry and nothing is queued for them. Losing a last seat does not cancel a death; additional seats reuse the person's event; a date that moves replaces it. A regent's death is the same event: the person's regencies are reassigned after their seats.

`PERSON_DEATH.run` consumes the token, applies the death's effects, then runs the seat walk (`SUCCESSION.succeedPerson`) with a fresh context for that death. The walk freezes held seats by descending current rank and ascending ID. Each step rechecks ownership and hierarchy: sovereign crowns use their own law, valid districts inherit immediately, and other seats are vacated. A prior merger or transfer can remove a later seat from the walk. Annual district settlement validates and grants seats, and ensures holder events; it does not inherit independently.

Availability considers every crown, and regency checks use the relevant local district rather than a foreign primary.

A reign has no end date until its ruler dies or is deposed: no death is known in advance ([health](../people/health-and-mortality.md)). An Incapable person cannot be elected, appointed or made regent, but can inherit; an incapable sovereign reigns under a regent ([simulated people](government-and-succession.md#regencies)).

## Districts

- **Grants.** A realm's district seats are exactly one tier below its highest held title, outside crown land: kingdoms under an emperor, duchies under a king, counties under a duke, none under a count. The crown keeps all top-tier seats and the one-tier-below titles around those seats and the capital. It grants a share of them by size: none up to 4 provinces, rising to 92% at 25+. Poor and distant seats are granted first.
- **Who gets a new grant.** In order:
  1. with 30% chance, the ruler's closest adult, landless relative (never the heir apparent);
  2. a cadet of an established house: the closest adult, landless relative of another district holder in the realm (never that holder's heir apparent), trying the nearest district first;
  3. a new house aged 18–55.

  The cadet rule applies at world start as well. It leaves the number of district holders unchanged and founds fewer houses: on the 204,000-point benchmark (seed 14963991, 867–1800) 263,889 people are created instead of 306,287, and the sovereign count is 40–90 lower in the first three centuries and 30–50 higher in the last three. Figures from `stats/history/2026-10-05T04-09-26-764Z-district-cadets/`; one seed.
- **Inheritance.** At the person-level death event a district passes to the next *adult* heir who holds no seat, else by the grant rule. Annual settlement does not inherit again. Minors never hold districts.
- **Loss.** A seat that stops being a district is vacated at revalidation; rank zero alone does not invalidate a county district.
- **Promotion and demotion.** Before grants, living landless displaced admins are ordered by lost district rank descending, owned population in their current home region descending, then lost seat id. The lost rank is retained from the seat's last district status. The home region is the current de jure title of that rank containing the lost seat, or the seat alone when absent or county-tier. An empty higher-rank district containing the lost seat promotes its strongest displaced admin. Otherwise a strictly lower district in the realm now owning the lost seat is chosen: inside the home region, vacant, higher rank, larger population, then lower id. A living bumped holder moves down by the same rule; with no candidate the admin stays landless. Yearly moves use `promotion` or `demotion`, write no opinion memory, and count toward the grant quota.
- **Revalidation.** `DISTRICTS.revalidate` is the per-seat check behind both rules: it vacates a seat that is no longer a district seat and keeps a living holder of a valid seat; affiliation follows current ownership without rewriting residence. The yearly pass runs it over every seat; a [partition](government-and-succession.md#partition) runs it over the divided realm's seats in the same succession.
- **Partition.** A new ruler's former district is vacated when the realm is divided. Seats taken or lost in a partition carry the seat reason `partition`: the heir's new seat, the district an heir or the primary gave up, and the seats displaced admins lose and take.

## Heirs

`HEIRS.of` is primogeniture with representation:
- children first, in birth order; a dead child's line comes before the next sibling;
- then the siblings' lines;
- then the parents' siblings' lines.

The culture's gender preference sorts each group: patriarchal prefers sons, matriarchal prefers daughters, equal ignores sex. Callers pass an eligibility filter.

`HEIRS.line` returns every child of a ruler in the same order, each with the first eligible person of that child's line (or none). A partition uses it to find one heir per child line.

## Personal unions

- **Formed** when one person comes to rule two single-heir realms by inheritance, or when two reigning single-heir rulers are married to each other (the heiress case).
- **Senior** is the realm that must lead (it already has juniors or an overlord), else the one with more provinces.
- **Blocked** for a new external link when realms are at war, either is already a union junior, or both must lead. Existing group membership remains compatible; eligibility checks every held crown.
- **Ended** when a partner's living ruler is someone other than that person or their spouse.
- **Merged** into the senior when an adjacent junior has had 3 shared rulers.

A living heir must be compatible with every held sovereign crown. Districts do not veto unions. Existing group membership follows junior-to-senior union edges only; diplomatic overlords and territorial parents are excluded. Sibling juniors can continue their existing group without a sibling link, even while their dead senior awaits its turn. An incompatible external crown still rejects the heir.

Installation rechecks surviving crowns after each external link. Existing groups retain their senior and edges. Each actual senior–junior edge advances once when both endpoints share the living successor, using the accounted-edge set of the walk's context (`state.successionContext`, set for the duration of one death's walk and null otherwise). New edges start at generation 1; spouse-only shared unions do not advance generations. Merger eligibility is checked immediately after continuation, and removed seats are skipped.

Installation and separately crowned spouses preflight all crown pairs before adding external links.

## District elections

County admins vote with their province’s population weight. Each valid direct local district supplies a population-weighted elector, even when its holder has other districts or a foreign primary. Candidates include the late ruler’s house senior. District nomination takes the top three district slots by descending population and ascending seat ID, then deduplicates eligible house seniors without refilling slots. Candidate strength uses the first nomination's weight. Republic patricians vote once per distinct eligible person.

Claimants use their strongest local qualifying district, with seat ID breaking population ties. Hereditary contests without a claimant district use the strongest backing district. Supporting seats are actual local elector seats, excluding the synthetic late-house vote. Ownership and district status are checked before release.

Republics consider every distinct patrician head’s house. Each elector backs their own house, then (outside republics) a house tied to theirs by marriage, else the strongest candidate: vote share, plus a bonus for age 25–60.

## Regencies

- **When.** A sovereign ruler under 16 gets a regent until 16, their death or a usurpation (cause `minority`). A sovereign who becomes Incapable, or is already Incapable when seated, gets one until their death or a usurpation (cause `incapacity`).
- **Who.** The first of these who is an adult, alive, capable and holds no throne:
  1. for a child, the surviving parent of either sex; for an incapable ruler, the spouse;
  2. the closest adult of the ward's house in inheritance order;
  3. the strongest district holder (lord protector), including a county admin;
  4. otherwise a regency council with no person.
- **Coming of age.** The end of a minority is queued for the ward's 16th birthday when the regency starts. A ward who has died or been deposed leaves it stale, and it never ends an incapacity regency. A ward who is Incapable on that birthday passes straight into an incapacity regency, with a new regent chosen by the incapacity order; otherwise a ward who [acceded to the throne](#coronation) is crowned.
- **Replacement.** A regent who dies is replaced at the moment of death, by the same order. One who takes a throne elsewhere or becomes Incapable is replaced at the yearly check.
- **After a partition.** Regencies start once the partition's seating is final, for the new realms and then for the primary realm, and one review replaces any regent who became sovereign in it ([government](government-and-succession.md#partition)).
- **Weak crown.** A realm under a regent, or whose ruler has health below 2.5 or stress of 300 or more, starts no wars and its districts rebel more easily ([rebellion](rebellions-and-throne-wars.md)). It still defends; diplomatic disposition governs subject calls.
- **Usurpation.** Yearly chance 3% for a kinsman regent, doubled if they hold a district of the realm, and 3% for a lord protector. A kinsman takes claim 1 and his house keeps the throne. A lord protector takes claim 0, their house takes the throne, their district returns to the crown, and the weak-crown rebellion check runs. A spouse or a council never usurps. The deposed ruler, child or incapable, becomes the realm's claimant.

## Coronation

Code: `src/model/history/sim/engine/events/succession/coronation` (`CORONATION.hold`, `.holdDeferred`, `.elevate`).

A coronation is the ceremony, regalia and recognition of a ruler, with the gifts handed to the realm's district admins. The realm's own treasury pays. There are two kinds.

**Accession coronation.** Held when a person becomes ruler of a realm that already exists and is still sovereign afterwards: by succession, usurpation or regime change, under every government type. It is held once the throne is settled, after any partition, regency choice, succession revolt and restoration attempt, so its gifts do not affect the accession's own revolt test; they affect the yearly rebellion tests of the following ten years. Lapsed founded titles dissolve at this point, and the realm may found one title [at or below its own rank](title-hierarchy.md#founding-and-dissolving-founding-coronationelevate); a title above it waits for an elevation.

Not crowned: rulers of realms created at that moment (partition heirs, breakaway and pretender realms, released provinces), initial and backfilled rulers, district holders, and a union junior that merges into its senior while taking the ruler.

**Under a regency.** A regent is never crowned, and no coronation is held while a regent governs.

- A child who took the throne by one of the accessions above is owed a coronation and is crowned on coming of age at sixteen, at that day's treasury, rank and district admins. One who dies or is deposed first is never crowned.
- Coming of age crowns nobody else. An initial ruler or a partition heir who starts under a minority regency was never owed a coronation and gets none at sixteen.
- A ruler who accedes Incapable, or a ward who is Incapable at sixteen, is never crowned. A sitting ruler who later becomes Incapable keeps the coronation they had.
- A regent who usurps the throne becomes the ruler and is crowned then.

Deferral to majority is the simpler of the historical practices (Louis XIV acceded at four in 1643 and was crowned at fifteen; Henry VI of England acceded as an infant in 1422 and was crowned at seven; Henry III was crowned at nine within weeks of acceding in 1216).

**Elevation coronation.** Held when a sitting ruler [founds a title](title-hierarchy.md#founding-and-dissolving-founding-coronationelevate) above the realm's rank in the yearly pass. It needs no change of ruler, so the ruler who assembled the lands is the one raised. It must be at least customary at the rank it is priced at, and it is held only if the title is actually created.

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

**Gifts.** Each living district admin of the realm, as they stood before any founding redrew the districts, remembers the coronation: resentment below customary, nothing at it, goodwill above it. The values and how the memories replace each other are in [interaction memories](../people/opinion-and-relationships.md#interaction-memories).

## Restoration

- **The claim.** A deposed child or the ruler overthrown in a [throne war](rebellions-and-throne-wars.md#throne-wars) becomes the realm's claimant. On their death the claim passes to their eldest child (generation 1). After that it lapses.
- **When they try.** Once on coming of age, and at every later succession, with chance 50% (generation 0) or 25% (generation 1). The chance doubles against a child ruler or a ruler with claim ≤ 1.
- **Contest.** The same district contest as a disputed succession. If it succeeds, a district leads the revolt with the claimant ruling the rebel realm (a `rebellion` note marked `restoration`); its district backers join it in a throne war.
- **End of the claim.** A revolt uses it up. It also ends if the claimant takes the throne, or lapses if the realm stops being sovereign.

## Patricians

Each electoral republic keeps 3–5 patrician house heads (the count is fixed per realm). A dead head passes to their heir who holds no seat; an extinct house is replaced by a new one aged 25–60.

## Historical presentation and reports

The selected-date wiki shows active held titles, primary first, separately from regencies. Lost titles remain in the timeline and previous-title summaries; unknown-start predecessor titles have summaries without fabricated accession events. Reports sample living people at initialization and integer-year boundaries, assigning each observation to one half-open window and including the final endpoint only in the last window. `heldSeatsHistogram` contains counts for zero, one and at least two seats. `seatsPerHolder` divides total held seats by observations with a seat and is null without holders. `unionHolders` counts observations with at least two sovereign crowns; districts and regencies do not count as crowns.

## Read-only inheritance projection

`SUCCESSION_PROJECTION.districts` and `SUCCESSION_PROJECTION.crowns` supply expected standing to the [marriage market](../people/marriage-and-alliances.md). Single-heir crowns use current `HEIRS.of` ordering, cultural gender preference and `SUCCESSION_SYSTEMS.inheritable`; districts use the same `DISTRICTS.heirOf` as actual district succession. Partition uses the actual branch/junior-heir and seat-allocation functions, preserving owned seats, excluding occupied seats and excluding the primary heir's district that actual succession vacates. No speculative election/appointment result, future birth or death is added. Projection changes no people, grants, events or RNG state. Both halves run before matching; the crown half runs again after a settlement founds a union, and a person's projected standing is the greater of the two. Current and projected standing remain separately inspectable.

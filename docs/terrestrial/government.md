# Government (`:history`)

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
| Single heir, then partition | chiefdom, tribal monarchy | The same rule picks the primary heir, who keeps the realm root; the other child lines then each take a district as a new realm (see Partition). |
| Election | elective monarchy, tribal federation, native council, steppe horde, republics | See below. |
| Appointment | theocracy, monastic state, warlord state, trading company, settler colony, modern regimes | Half the time an adult of a district-holding house of the preferred sex, else a new house. |

**Elections.**
- *Electors.* In monarchies each valid direct local district casts a vote weighted by its population; one holder can cast multiple district votes. In republics the patrician heads vote, one vote each.
- *Candidates.* The late ruler’s house senior, plus eligible house seniors from the top three district slots by population and seat ID. Repeated nominees are removed without refilling slots; republics consider every distinct head’s house.
- *Votes.* Each elector backs their own house, then (outside republics) a house tied to theirs by marriage, else the strongest candidate: vote share, plus a bonus for age 25–60.

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

Disputed succession pretenders fight for the throne; a victory replaces the ruler. The war rules are in [rebellion](rebellion.md).

## Partition

Chiefdoms and tribal monarchies treat the realm as the dynasty's patrimony, as in the Frankish divisions of 511 and 843, Kievan Rus' after 1054 and Poland's testament of 1138. When their ruler dies with more than one eligible child line, the realm is divided (`PARTITION.divide`, called from the succession event once the primary heir holds the throne).

**Who the heirs are.**
- The primary heir is chosen as in any single-heir realm and keeps the realm root. Nothing is divided unless the primary is the late ruler's child or a descendant of one.
- Every other child line gives at most one junior heir (`HEIRS.line`): the child if alive, else the first living person of a dead child's line. A junior heir must not already be sovereign somewhere. A living child who is not eligible is not replaced by their own children, and never blocks another line.
- When any junior heir is of the culture's preferred sex, only those remain. Minors are included.

**Shares.**
- Each junior heir takes one district seat of the realm, with the land under it.
- An heir who already holds a district of the realm takes that seat and no other. Nobody is given a seat another heir holds.
- The other heirs, in inheritance order, take the best seats left: higher title tier first, then larger population.
- A district with an enemy-occupied province is not handed out; an heir whose own district is occupied stays its admin. Heirs beyond the available seats get nothing.
- The primary keeps the root, the crown demesne and every district nobody took. Realms of 4 provinces or fewer have no districts and never divide.

**Release.** Shares leave one at a time, best seat first. Each is checked again just before it leaves, because an earlier release can move titles and change the hierarchy: the seat must still be a district of the realm, hold no occupied province, and its heir must still be eligible. A share that fails is dropped. The heir gives up any other district they hold, takes the seat, and the district becomes a sovereign realm through the same release as a rebellion (`STATE.releaseFaction`):
- it holds the seat's land as of the release and a population-proportional share of the treasury;
- it takes the divided realm's government;
- it is at peace with neutral relations, apart from a personal union formed at once when the heir is married to the reigning ruler of another single-heir realm;
- its ruler has claim 3.

The primary's own former district is vacated before seats are assigned. A primary who already ruled another realm keeps it, in the personal union the inheritance forms.

**Cut-off land.** After the releases, every district or crown province the primary still owns must connect to the root by land or sea adjacency through the primary's territory.
- A cut-off piece joins a bordering realm created by this partition whose top title tier is higher than the piece's: highest tier first, then larger population. Every possible join is made before anything is freed, so a piece that only borders another cut-off piece can follow it.
- A piece with an occupied province joins nobody.
- What is still cut off is released as independent, as after a rebellion (`province released`).

**Displaced admins.** A living admin who lost a seat to an heir, or whose seat stopped being a district seat, moves down in the realm that now owns the seat they lost:
- they take a seat of strictly lower title tier: a vacant one if any, else a held one (higher tier first, then larger population);
- a living holder bumped this way moves down by the same rule; a dead one ends the chain;
- with no lower seat they are landless.

No dead person is seated. An admin who keeps a valid seat belongs to the realm that owns it now, so the admin of a district that joined an heir realm follows it. Dead holders of valid seats inherit at their person-level death event; yearly district settlement validates seats and ensures scheduling without repeating inheritance.

**Regencies** start only when the seating is final: first for each new realm with a minor ruler, then for the primary realm, then one regency review so a regent of any other realm who has just become sovereign is replaced. A sibling who received a realm of their own is never a minor heir's regent.

**No succession revolt.** A succession that creates at least one heir realm starts no pretender revolt, no weak-crown revolt and no restoration revolt, and a deposed claim is not used up. A succession that creates none keeps all three. The yearly rebellion check and regent usurpation are unchanged.

**Notes.** Every succession of a partitioning realm writes one note:
- `partition skipped`, with the reason: `not child line`, `no junior heir` or `no free seat`;
- `partition`, with the heirs and their seats, every resulting realm's kind (`primary`, `heir`, or `released` for cut-off land that went independent), population, province count and top tier, the admins who moved and where, the districts that joined an heir realm, the heirs who received nothing and why (`no seat`, `reserved seat unavailable`, `share dropped`), and the titles left without a holder.

The history report's `partition` section is built from these notes (`src/test/history-run/report/partition`): how often realms divide and why not, how large the shares are, what happens to title holding, and what becomes of the heir realms.

## Character effects

Election candidate strength gains `0.025 × (diplomacy - 5.5)`. Regent usurpation chance gains `clamp(1 + 0.125 × (intrigue - 5.7), 0.5, 2)` and a personality factor (Ambitious ×2, Content ×0). Restoration chance is multiplied by 1.5 for an Ambitious claimant and 0.5 for Content before the probability cap. See [character](character.md) for the full rules.

## Household holdings and scheduling

[Households](households.md) describes the independent seat index, frozen death walk and local election rules. One death event per person succeeds all surviving crowns under their own laws and valid districts immediately, in current rank/ID order, then reassigns the regencies that person held. A merger or prior transfer can remove a later frozen seat. District succession selects an adult landless relative or founds a new house. Availability considers every crown, and regency checks use the relevant local district rather than a foreign primary.

A reign has no end date until its ruler dies or is deposed: no death is known in advance ([health](health.md)). An Incapable person cannot be elected, appointed or made regent, but can inherit; an incapable sovereign reigns under a regent ([people](people.md#regencies)).

Single-heir union eligibility checks every sovereign crown held by the heir, ignoring districts. Existing senior and sibling-junior membership is compatible without inventing sibling edges. Installation and separately crowned spouses preflight all crown pairs and recheck changed memberships after each external link. Actual senior–junior edges advance once per shared successor dispatch; new edges start at generation 1 and spouse-only links do not advance generations. Merger checks run immediately.

Monarchic nominations take three ranked district slots, then deduplicate house seniors without refilling. The first nomination supplies candidate weight. Republic heads vote once per distinct person. Claimants and backers use their strongest actual local district (population then seat ID), and ownership is revalidated before releasing supporting seats.

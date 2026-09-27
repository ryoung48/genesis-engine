# People (`:history`)

Code: person model in `src/model/history/sim/people` (`index.ts`, `family/`, `heirs/`, `lifespan/`, `health/`); engine wiring in `src/model/history/sim/engine/events/people` (`districts/`, `royal-marriages/`, `patricians/`) and `engine/events/succession` (`systems/`, `regency/`, `restoration/`); unions in `engine/state/index.ts`; record in `src/model/history/record/people`.

People are the cause behind realm events, not a population. Only ruling houses are simulated: a few thousand people on the default map.

## Who is tracked

- **Seat holders.** Sovereign rulers (`rulerOf[root]`), district holders (`rulerOf[seat]`) and the patrician house heads of electoral republics.
- **Their close family.** Spouses, children and siblings. They are generated with the holder and live on in the person table.
- **Everyone else is never created.** Spouses from outside the ruling houses are made up on the spot at the wedding (see Marriage).

A person is **recorded** (sent to the history record and wiki) when they hold a seat, are a seat holder's parent, spouse, child or sibling, are born to a seat holder, become a regent, or inherit a deposed claim. Unrecorded people still exist in the sim but never appear in the record.

## What is tracked per person

`PersonTable` (columns indexed by person id): sex, birth and death (years), father, mother, spouse, dynasty (-1 for none), culture, name seed, home (realm at birth; names come from its culture), realm (where they live), throne (the seat they hold, or -1), children, marriage time, and whether they are recorded.

State-level maps in `PeopleState`:

| Field | Meaning |
|---|---|
| `rulerOf` | Holder of each seat (sovereign root or district), -1 if empty. `PEOPLE.setRuler` is its only writer. |
| `patricians` | 3–5 patrician house heads per electoral republic. |
| `unionGenerations` | Shared rulers counted per union junior. |
| `marriageAlliances` | Realm pairs allied by a royal marriage. |
| `regencies` | Realm → `{ ward, regent (-1 = council), kind }`. |
| `deposed` | Realm → `{ claimant, generation, tried }` for deposed rulers' lines. |
| `log` | Rows since the last journal flush: new recorded persons, marriages, seat changes (ruler, district or regent). |

## Life

- **Death is fixed at birth** (`LIFESPAN.deathAt`). Yearly hazard: 12% under 1, 2.5% under 5, 0.7% under 16, then 1.2% (men) or 2% (women, childbirth) under 40, then Gompertz ageing (1.2% × e^(0.09 × (age − 40))). Nobody lives past 100.
- **Health is read back from the death date** (`HEALTH.band`): Grave in the last half year, Poor in the last 2 years of a life ending at 40+, Fair in the last 6 years of a life ending at 50+, else Good.
- **Births.** Each year a married couple bears a child with the mother's age-based fertility: 30% at 16–19, 35% at 20–29, 28% at 30–34, 18% at 35–39, 7% at 40–44, 0 otherwise. Only couples where one spouse is a ruler or a ruler's child keep having children. Sex is 50/50.
- **Dynasty** follows the father, or the mother in matriarchal cultures. It falls back to the other parent when the first has none. Dynasties spread only through births.
- **Names** are drawn from the home culture. The name seed is redrawn until the name's gender matches the person's sex.

## Founding a house

`FAMILY.found` creates a new ruler of a given age with a fresh dynasty:
- a father who has already died and a living mother, with siblings born from the mother's 17th birthday onward;
- with 85% chance (if 18+), a spouse from outside and their children so far.

Founders are used for starting rulers, new houses taking a throne, new district holders and new patrician houses.

Starting ruler ages: 1–10 (weight 1), 11–15 (2), 16–30 (5), 31–50 (4), 51–65 (1). About a fifth start as children.

## Marriage

Once a year (`FAMILY.runYear`) for rulers, their children and their siblings:

1. **Who seeks.** Unmarried or widowed women 16–39 and men 18–49; each seeks with 35% chance that year.
2. **Foreign or home.** Families of realms that marry for alliance (single heir, or non-republic election) look abroad 80% of the time; others 30%.
3. **Foreign search.** Neighbouring realms first, then neighbours' neighbours, among that year's other seekers of the opposite sex. *Royal blood* (a sovereign ruler or their child) looks for royal blood across both rings before settling for a lesser house. The spouse moves to the ruler's realm, or else to the husband's.
4. **Waiting.** Royals of alliance-marrying realms who find no foreign match and are under 25 stay single and try again next year.
5. **Home match.** Otherwise they marry a made-up outsider of no house from their own culture: a wife up to 8 years younger (at least 15), a husband up to 8 years older.

At the start, 40% of married kings in alliance-marrying realms have their queen re-parented into a neighbouring ruling house, as that ruler's sister or daughter when the ages fit (`ROYAL_MARRIAGES.seed`).

## Alliances from marriage

- A wedding between the ruling families (ruler, children, siblings) of two sovereign, alliance-marrying realms makes them allies, unless they are at war or in a subject or union bond. The note is `marriage alliance`.
- While a living marriage joins the two ruling families, the alliance does not re-roll in diplomacy. When no such marriage is left, the marriage alliance ends and the alliance drifts like any other.
- A regent parent born into another ruling house holds the alliance with that house's realm the same way while she governs.

## Districts

- **Grants.** A realm's titled direct subjects are its district seats. It grants a share of them by size: none up to 4 provinces, rising to 92% at 25+. Poor and distant seats are granted first.
- **Who gets a new grant.** With 30% chance the ruler's closest adult, landless relative (never the heir apparent). Otherwise a new house aged 18–55.
- **Inheritance.** A dead holder's district passes to their next *adult* heir who holds no seat, else by the grant rule. Minors never hold districts.
- **Loss.** A district that stops being a direct titled subject is vacated.

## Heirs

`HEIRS.of` is primogeniture with representation:
- children first, in birth order; a dead child's line comes before the next sibling;
- then the siblings' lines;
- then the parents' siblings' lines.

The culture's gender preference sorts each group: patriarchal prefers sons, matriarchal prefers daughters, equal ignores sex. Callers pass an eligibility filter.

## Succession

The government type picks the system (`GOVERNMENT.successionOfIndex`):

| System | Governments | Rule |
|---|---|---|
| Single heir | chiefdom, tribal / feudal / absolute / constitutional monarchy, dynastic signoria, imperial cult | `HEIRS.of`. The heir may already rule elsewhere, which forms a personal union. With no heir, the strongest adult district holder takes it as a new house. |
| Election | elective monarchy, tribal federation, native council, steppe horde, republics | See below. |
| Appointment | theocracy, monastic state, warlord state, trading company, settler colony, modern regimes | Half the time an adult of a district-holding house of the preferred sex, else a new house. |

**Elections.**
- *Electors.* In monarchies the district holders vote, weighted by district population. In republics the patrician heads vote, one vote each.
- *Candidates.* The late ruler's house senior, plus the senior adults of the top 3 electors' houses (every elector's house in a republic).
- *Votes.* Each elector backs their own house, then (outside republics) a house tied to theirs by marriage, else the strongest candidate: vote share, plus a bonus for age 25–60.

**Claim**, by how the ruler took the throne, feeds title founding and weak-crown rebellions:
- 3: child or founder, and a restored claimant;
- 2: sibling or elected;
- 1: other relative, appointed, or a usurping kinsman;
- 0: new house or lord protector.

**Disputes.** A single-heir succession is disputed when the heir rules elsewhere, is under 16, or is of the sex the culture passes over, and an adult of the preferred sex stands next in line.
- The district holders split between the heir and the rival. With at least 40% backing, and then with a chance equal to that share, the rival's district (or their strongest backer's) revolts with the rival as pretender.
- A losing election candidate who holds a district and won 40% also revolts.
- Otherwise every succession re-tests each district's rebellion threshold, lowered by 0.05 per missing claim point and by 0.1 under a weak crown. At most one district breaks away.

## Personal unions

- **Formed** when one person comes to rule two single-heir realms by inheritance, or when two reigning single-heir rulers are married to each other (the heiress case).
- **Senior** is the realm that must lead (it already has juniors or an overlord), else the one with more provinces.
- **Blocked** when the realms are at war, either is already a union junior, or both must lead.
- **Ended** when a partner's living ruler is someone other than that person or their spouse.
- **Merged** into the senior when an adjacent junior has had 3 shared rulers.

## Regencies

- **When.** A sovereign ruler under 16 gets a regent until 16, their death or a usurpation.
- **Who.** The first of these who is an adult, alive and holds no throne:
  1. the surviving parent, of either sex;
  2. the closest adult of the child's house in inheritance order;
  3. the strongest district holder (lord protector);
  4. otherwise a regency council with no person.
- **Replacement.** A regent who dies is replaced at the moment of death, by the same order. One who takes a throne elsewhere is replaced at the yearly check.
- **Weak crown.** A realm under a regent, or whose ruler is in Poor or Grave health, starts no wars and gets +0.1 rebellion laxity. It still defends and answers calls.
- **Usurpation.** Yearly chance 3% for a kinsman regent, doubled if they hold a district of the realm, and 3% for a lord protector. A kinsman takes claim 1 and his house keeps the throne. A lord protector takes claim 0, their house takes the throne, their district returns to the crown, and the weak-crown rebellion check runs.

## Restoration

- **The claim.** A deposed child becomes the realm's claimant. On their death the claim passes to their eldest child (generation 1). After that it lapses.
- **When they try.** Once on coming of age, and at every later succession, with chance 50% (generation 0) or 25% (generation 1). The chance doubles against a child ruler or a ruler with claim ≤ 1.
- **Contest.** The same district contest as a disputed succession. If it succeeds, a district revolts with the claimant ruling the rebel realm (a `rebellion` note marked `restoration`).
- **End of the claim.** A revolt uses it up. It also ends if the claimant takes the throne, or lapses if the realm stops being sovereign.

## Patricians

Each electoral republic keeps 3–5 patrician house heads (the count is fixed per realm). A dead head passes to their heir who holds no seat; an extinct house is replaced by a new one aged 25–60.

## Yearly order

The yearly `PEOPLE_YEAR` event runs, in order:
1. district inheritance and new grants;
2. the marriage-alliance review;
3. patrician upkeep;
4. marriages and births, then marriage alliances and heiress unions from that year's weddings;
5. the regency review, usurpation rolls and restoration.

Successions, coming of age and rebellions run on their own events at the exact time.

## Record and wiki

- **Journal.** Each flush carries new recorded persons, marriages and seat rows. A seat row's kind is `ruler`, `district` or `regent`; a regent row also names the ward.
- **Record.** `PEOPLE_RECORD` builds persons, marriages and tenures, indexed by person, by seat and by ward. Regent tenures are kept apart from holder tenures on the same seat.
- **Queries.** `PERSON_QUERY` gives the person view, the timeline, the seat holder at a time, and health.
- **Nation timelines.** Only realm-level person events reach them:
  - successions;
  - regency start, coming of age, regent change and usurpation;
  - marriage alliances (one row per royal marriage and its alliance);
  - unions;
  - pretender and restoration revolts.

  Everything else stays on the person page.

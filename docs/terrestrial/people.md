# People (`:history`)

See [households](households.md) for residence, affiliation, holdings and succession, [health](health.md) for ageing, conditions and how death is decided, [families](families.md) for when weddings, births and deaths take effect, [character](character.md) for inherited attributes, traits, governors and stress, and [people records](people-records.md) for how people reach the history record.

Code: person model in `src/model/history/sim/people` (`index.ts`, `family/`, `betrothal/`, `fertility/`, `heirs/`, `lifespan/`, `health/`, `log/`); engine wiring in `src/model/history/sim/engine/events/people` (`districts/`, `royal-marriages/`, `patricians/`) and `engine/events/succession` (`systems/`, `partition/`, `regency/`, `restoration/`); unions in `engine/state/index.ts`; record in `src/model/history/record/people`.

People are the cause behind realm events, not a population. Only ruling houses are simulated: a few thousand people on the default map.

## Who is tracked

- **Seat holders.** Sovereign rulers (`rulerOf[root]`), district holders (`rulerOf[seat]`) and the patrician house heads of electoral republics.
- **Their close family.** Spouses, children and siblings. They are generated with the holder and live on in the person table.
- **Everyone else is never created.** Spouses from outside the ruling houses are made up on the spot at the wedding (see Marriage).

Every person the simulation creates is recorded, landed or not, living or dead: see [people records](people-records.md).

## What is tracked per person

`PersonTable` (columns indexed by person id): sex, birth and death (years; death is `Infinity` until a date is chosen), father, mother, spouse, dynasty (-1 for none), culture, name seed, home (realm at birth; names come from its culture), residence (current household province), initialResidence (birth-effective province), heldSeats (sorted unique seat IDs), children, marriage time, betrothed partner and betrothal time (-1 without one), base fertility (0.5–0.6, drawn at creation), peak (highest seat standing ever held) and next birth (earliest next conception).

The additional character columns are `bases`, `personality`, `grades`, `congenital`, `carried` and `stress`. See [packing and inheritance](character.md). The ten health columns are listed in [health](health.md#simulation-columns).

State-level maps in `PeopleState`:

| Field | Meaning |
|---|---|
| `rulerOf` | Holder of each seat (sovereign root or district), -1 if empty. `PEOPLE.setRuler` is its only writer. |
| `stressed` | People with positive stress after the preceding annual pass; used to reset former sovereign rulers. |
| `patricians` | 3–5 patrician house heads per electoral republic. |
| `unionGenerations` | Shared successors counted once per actual senior–junior edge and dispatch. |
| `residenceHistory` | Sparse retained effective-time moves and birth corrections, including dead people; independent of the pending log. |
| `household` | Engine-provided territorial-sovereign, rank and time callbacks. |
| `marriageAlliances` | Realm pairs allied by a royal marriage. |
| `regencies` | Realm → `{ ward, cause (minority or incapacity), regent (-1 = council), kind }`. |
| `bereavements` | Deaths of a spouse or child since the last yearly pass, by the bereaved; read and cleared by the stress step. |
| `deliveries` | Pending pregnancies by id and by mother ([families](families.md#pregnancy)). |
| `deposed` | Realm → `{ claimant, generation, tried }` for deposed rulers' lines. |
| `log` | Rows appended since the last journal flush, as typed columns, and the cursor of people already sent. See [people records](people-records.md). |

## Life

- **Death is decided by health, year by year.** Nobody has a death date at birth. Each yearly pass ages the living and projects death over the coming year from their effective health and a background hazard; see [health](health.md).
- **Other deaths** are immediate: a fatal delivery, a failed heart, a ruler killed leading a battle. Every death, of a seat holder or not, is applied at its own time by one death event ([families](families.md#death)).
- **Health bands** follow effective health: Dying, Near death, Poor, Fine, Good, Excellent.
- **Births** come from pregnancies (see Pregnancy). Only couples where one spouse is a ruler or a ruler's child keep having children.
- **Dynasty** follows the father, or the mother in matriarchal cultures. It falls back to the other parent when the first has none. Dynasties spread only through births.
- **Names** are drawn from the home culture. The name seed is redrawn until the name's gender matches the person's sex.

## Pregnancy

`FERTILITY.project` steps month by month through the coming year for each married couple in scope and queues the pregnancies it finds; the children are created when each pregnancy ends ([families](families.md#pregnancy)). `nextBirth` carries the spacing across years.

- **Who.** Both parents alive, capable and 16+, the mother under 45 at the due date, not within 3 months of her last pregnancy's end, and the couple's living children below their cap.
- **Monthly chance.** Mother: `max(0, fertility − 0.05 × her earlier children)` × her age factor (1 to 25, 0.9 to 30, 0.7 to 35, 0.5 to 40, 0.33 to 45, else 0.1). Father: `fertility` × his age factor (1 to 35, 0.9 to 40, 0.8 to 50, 0.7 to 60, 0.6 to 70, else 0.5). The chance is `clamp(((mother + father) / 2 + bonus) × 0.0475, 0.01, 0.25)`, × 0.85 unless one spouse holds a seat. The bonus is 0.3 for a seat holder's first child.
- **Character fertility.** Each parent's fertility term is multiplied by `max(0, 1 + active trait fertility sum)`, by the stress fertility factor (1, 0.9, 0.7, 0.5) and by the Infirm fertility factor (−10% per row reached). Carried traits contribute nothing.
- **Outcome**, as weights out of `N + 17`: normal birth N = 215 (−10 if the mother's health is 5 or below, −25 if 3 or below; +5 with 2+ earlier children, +5 more with 4+); miscarriage 10 (80–120 days); stillbirth 3 (180–200 days); mother dies 2 (the child is born at 280 days and she dies at the birth); mother and child die 2 (180–200 days). About 1.5% of pregnancies kill the mother.
- **Twins**, on a live birth: 4% if the mother is 25–35, else 2%; +5% if she has had twins, +3% if her mother has. Girls are 49%.
- **Standing** of a seat is its title tier + 1 (1 for a county seat, up to 5 for a hegemony). A couple's standing is the highest `peak` among the spouses and their parents.
- **Cap on living children** by standing 0–5: 1, 2, 3, 5, 5, 8; +2 if a spouse holds a seat; −1 for about half of couples (a fixed hash of the pair).
- **Record.** Miscarriages, stillbirths and childbirth deaths are `pregnancy` rows. They show only on the mother's page ("miscarriage", "stillborn child", "died in childbirth"); a reigning queen's death reaches her realm only as its succession.

## Founding a house

`FAMILY.found` creates a new ruler of a given age with a fresh dynasty:
- a father who has already died and a mother who lived at least to the founder's birth, with siblings from the mother's 16th birthday onward, kept clear of the founder's own pregnancy;
- the father and the founder take the standing of the seat the house is founded for, which sets the family's size;
- with 85% chance (if 18+), a spouse from outside and their children so far.

Founders are used for starting rulers, new houses taking a throne, new district holders and new patrician houses. Each created person's health is aged from birth to the present, and death is drawn only from the date they are known to have reached ([health](health.md#people-created-with-a-past)).

Starting ruler ages: 1–10 (weight 0.4), 11–15 (0.2), 16–30 (5), 31–50 (4), 51–65 (1). About 6% start as children, close to the 4–6% share of child rulers once successions settle.

## Marriage

Once a year (`FAMILY.runYear`) for rulers, their children and their siblings:

1. **Who seeks.** Unmarried or widowed women 16–39 and men 18–49 who are not betrothed; each seeks with 35% chance that year. Royal children aged 12–15 also seek (see Betrothal).
2. **Foreign or home.** Families of realms that marry for alliance (single heir, or non-republic election) look abroad 80% of the time; others 30%.
3. **Foreign search.** Neighbouring realms first, then neighbours' neighbours, among that year's other seekers of the opposite sex. *Royal blood* (a sovereign ruler or their child) looks for royal blood across both rings before settling for a lesser house. The unlanded spouse joins the landed spouse’s household, or else the male spouse’s; separately landed spouses retain their seats and locations.
4. **Waiting.** Royals of alliance-marrying realms who find no foreign match and are under 25 (minors included) stay single and try again next year.
5. **Home match.** Otherwise they marry a made-up outsider of no house from their own culture: a wife up to 8 years younger (at least 15), a husband up to 8 years older.

A foreign match where either party is under 16 is a betrothal, not a wedding (see Betrothal).

At the start, 40% of married kings in alliance-marrying realms have their queen re-parented into a neighbouring ruling house, as that ruler's sister or daughter when the ages fit (`ROYAL_MARRIAGES.seed`).

## Betrothal

Royal houses promise their children before they come of age, as in CK3 (`BETROTHAL`, matched by `FAMILY.seekMatches`).

- **Who.** Members of a sovereign ruler's family (the ruler, children, siblings) aged 12–15 in alliance-marrying realms, unmarried and unbetrothed, seek with 35% chance a year. They never take a home match.
- **Match.** The same foreign rings. When either party is a minor, both must be 12+, at most 5 years apart, and the pair must pass the marriage-alliance check (`ROYAL_MARRIAGES.alliable`). A betrothal is always an alliance match.
- **Result.** Either party under 16 makes a betrothal (`betrothed` and `betrothedAt` on both); two adults wed as before. The betrothal forms or binds the marriage alliance at once.
- **Fulfilment.** Each yearly pass weds every living pair where both are 16+, by the usual host rule. Heiress unions apply. Betrothed men therefore marry at 16.
- **Breaking.** Only two causes:
  - *death*: either party died (released at the death);
  - *alliance*: the review finds no marriage alliance between the pair's realms (war, lost sovereignty, a government that stops marrying for alliance, or a succession that moves the betrothed out of the ruler's family). A betrothal whose alliance cannot form is broken at once.
- **Start.** After `ROYAL_MARRIAGES.seed`, every royal minor seeks once, under the same rules. The world opens with about a third fewer standing betrothals than it holds at years 20–30.

## Alliances from marriage

- A wedding or betrothal between the ruling families (ruler, children, siblings) of two sovereign, alliance-marrying realms makes them allies, unless they are at war or in a subject or union bond. The note is `marriage alliance`.
- While a living marriage or betrothal joins the two ruling families, the alliance does not re-roll in diplomacy. When none is left, the marriage alliance ends, its betrothals are broken, and the alliance drifts like any other.
- A regent parent born into another ruling house holds the alliance with that house's realm the same way while she governs.

## Districts

- **Grants.** A realm's titled direct subjects are its district seats. It grants a share of them by size: none up to 4 provinces, rising to 92% at 25+. Poor and distant seats are granted first.
- **Who gets a new grant.** With 30% chance the ruler's closest adult, landless relative (never the heir apparent). Otherwise a new house aged 18–55.
- **Inheritance.** At the person-level death event a district passes to the next *adult* heir who holds no seat, else by the grant rule. Annual settlement does not inherit again. Minors never hold districts.
- **Loss.** A district that stops being a direct titled subject is vacated.
- **Revalidation.** `DISTRICTS.revalidate` is the per-seat check behind both rules: it vacates a seat that is no longer a district seat and keeps a living holder of a valid seat; affiliation follows current ownership without rewriting residence. The yearly pass runs it over every seat; a [partition](government.md#partition) runs it over the divided realm's seats in the same succession.
- **Partition.** A new ruler's former district is vacated when the realm is divided. Seats taken or lost in a partition carry the seat reason `partition`: the heir's new seat, the district an heir or the primary gave up, and the seats displaced admins lose and take.

## Heirs

`HEIRS.of` is primogeniture with representation:
- children first, in birth order; a dead child's line comes before the next sibling;
- then the siblings' lines;
- then the parents' siblings' lines.

The culture's gender preference sorts each group: patriarchal prefers sons, matriarchal prefers daughters, equal ignores sex. Callers pass an eligibility filter.

`HEIRS.line` returns every child of a ruler in the same order, each with the first eligible person of that child's line (or none). A partition uses it to find one heir per child line.

## Succession

How a realm passes on (the systems, elections, claim, disputes and the partition of tribal realms) is described in [government](government.md#succession).

## Personal unions

- **Formed** when one person comes to rule two single-heir realms by inheritance, or when two reigning single-heir rulers are married to each other (the heiress case).
- **Senior** is the realm that must lead (it already has juniors or an overlord), else the one with more provinces.
- **Blocked** for a new external link when realms are at war, either is already a union junior, or both must lead. Existing group membership remains compatible; eligibility checks every held crown.
- **Ended** when a partner's living ruler is someone other than that person or their spouse.
- **Merged** into the senior when an adjacent junior has had 3 shared rulers.

## Regencies

- **When.** A sovereign ruler under 16 gets a regent until 16, their death or a usurpation (cause `minority`). A sovereign who becomes Incapable, or is already Incapable when seated, gets one until their death or a usurpation (cause `incapacity`).
- **Who.** The first of these who is an adult, alive, capable and holds no throne:
  1. for a child, the surviving parent of either sex; for an incapable ruler, the spouse;
  2. the closest adult of the ward's house in inheritance order;
  3. the strongest district holder (lord protector);
  4. otherwise a regency council with no person.
- **Coming of age.** The end of a minority is queued for the ward's 16th birthday when the regency starts. A ward who has died or been deposed leaves it stale, and it never ends an incapacity regency.
- **Replacement.** A regent who dies is replaced at the moment of death, by the same order. One who takes a throne elsewhere or becomes Incapable is replaced at the yearly check.
- **After a partition.** Regencies start once the partition's seating is final, for the new realms and then for the primary realm, and one review replaces any regent who became sovereign in it ([government](government.md#partition)).
- **Weak crown.** A realm under a regent, or whose ruler has health below 2.5 or stress of 300 or more, starts no wars and its districts rebel more easily ([rebellion](rebellion.md)). It still defends; diplomatic disposition governs subject calls.
- **Usurpation.** Yearly chance 3% for a kinsman regent, doubled if they hold a district of the realm, and 3% for a lord protector. A kinsman takes claim 1 and his house keeps the throne. A lord protector takes claim 0, their house takes the throne, their district returns to the crown, and the weak-crown rebellion check runs. A spouse or a council never usurps. The deposed ruler, child or incapable, becomes the realm's claimant.

## Restoration

- **The claim.** A deposed child or the ruler overthrown in a [throne war](rebellion.md#throne-wars) becomes the realm's claimant. On their death the claim passes to their eldest child (generation 1). After that it lapses.
- **When they try.** Once on coming of age, and at every later succession, with chance 50% (generation 0) or 25% (generation 1). The chance doubles against a child ruler or a ruler with claim ≤ 1.
- **Contest.** The same district contest as a disputed succession. If it succeeds, a district leads the revolt with the claimant ruling the rebel realm (a `rebellion` note marked `restoration`); its district backers join it in a throne war.
- **End of the claim.** A revolt uses it up. It also ends if the claimant takes the throne, or lapses if the realm stops being sovereign.

## Patricians

Each electoral republic keeps 3–5 patrician house heads (the count is fixed per realm). A dead head passes to their heir who holds no seat; an extinct house is replaced by a new one aged 25–60.

## Yearly order

The yearly `PEOPLE_YEAR` event runs, in order:
1. the stress step for every sovereign ruler, then the deaths of any whose heart failed;
2. the health pass: completed ages, band and condition changes, death projected for the coming year, and regents for the newly Incapable;
3. district inheritance and new grants, the marriage-alliance review (which also breaks betrothals left without an alliance) and patrician upkeep;
4. fulfilled betrothals, marriages and new betrothals, then marriage alliances and heiress unions from them;
5. the coming year's conceptions, then the regency review, usurpation rolls and restoration.

Deaths, births, coming of age and rebellions run on their own events at the exact time. [Families](families.md) has the order of same-time events.

## Record and wiki

- **Journal and record.** Each journal transaction carries its people rows as one typed-array packet, and `PEOPLE_RECORD` folds the packets into person columns and the derived marriages, betrothals, tenures, pregnancies and stress rows. [People records](people-records.md) has the row kinds, the packet and the record's structures. A ruler's `rulerChange` entry on the nation timeline gets their death date and cause when they die.
- **Queries.** `PERSON_QUERY` gives the person view, the timeline, the seat holder at a time, the health band, the conditions and the cause of death, all at the selected time and from recorded rows only. On a mother's timeline, "miscarriage" and "stillborn child" are added. The death row reads "died", "died in childbirth", "died of heart failure" or "was killed in battle" by its cause. Conditions add "developed", "worsened", "no longer had", "went blind" and "became incapable" rows. The person page shows Health, Conditions (with levels) and, for the dead, Cause of death. "betrothed" and, for an alliance break, "betrothal broken" are added. The person page shows them as Family rows, and a "Betrothed" chip group while a betrothal stands.
- **Nation timelines.** Only realm-level person events reach them:
  - successions, naming a predecessor who was killed in battle, died of heart failure or died in childbirth;
  - partitions: one Ruler row naming the late ruler, what the primary kept, the realm each junior heir received, and each district that passed to an heir realm;
  - regency start (saying when the ruler could no longer rule), coming of age, regent change and usurpation;
  - marriage alliances (one row per royal marriage and its alliance; the row says "was betrothed to" when the couple had not yet married);
  - unions;
  - pretender and restoration revolts.

  Everything else stays on the person page.
- **Partition wording.** A realm created by a partition reads "Split from X in the partition of [late ruler]'s realm, under [heir]". On person pages a seat taken or lost in one reads "became ruler of Y in the partition of X", "took the seat of Z in the partition of X" or "lost Y in the partition of X". The nation stats show a Succession row: Single heir, Partition, Election or Appointment.

## Character records and wiki

Person rows preserve packed innate character. Stress rows record level changes and resets; `PERSON_QUERY.attributes`, `.traits` and `.stress` read character at the selected date, with personality ages 9/11/13.

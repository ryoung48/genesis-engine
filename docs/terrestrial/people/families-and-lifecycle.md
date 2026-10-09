# Families, births and lifespans

Scope: `:history`.

These rules govern the lives and kinship of [simulated people](overview.md). [Marriage](marriage-and-alliances.md) owns partner selection; [succession](../politics/government-and-succession.md#holder-death-scheduling) owns holder death scheduling.

See [health](health-and-mortality.md) for how death is decided, [household residence](residence-and-realm.md) for location, and [person records](../mechanics/person-records.md) for the rows written.

Code: `src/model/history/sim/people/fertility` (`FERTILITY`), `family` (`FAMILY`); `src/model/history/sim/engine/events/people` (`PEOPLE_EVENTS`), `events/people/birth` (`BIRTH_EVENTS`), `events/people/death` (`PERSON_DEATH`), `events/people/death/schedule` (`DEATH_SCHEDULE`); `engine/event-heap`.

## The rule

A birth or a death takes effect at the time it happens, as its own event. A wedding completes in the yearly pass. Nothing is created ahead of time: there is no unborn child in the person table and no future death in the record.

## The yearly pass

`PEOPLE_YEAR` at year Y. Births and deaths due at Y have already run.

1. **Stress.** Every sovereign ruler is stepped once, from a list fixed at the start. Hearts that failed are then dated to Y, all of them before any succession, and die in person order.
2. **Health.** Completed ages are processed and death is projected over `[Y, Y+1)`; a chosen date gets a death event. A sovereign who became Incapable gets a regent.
3. **Seats and alliances.** District settlement and grants, the marriage-alliance review, patrician upkeep.
4. **Weddings.** Betrothals whose parties are both 16 are fulfilled, seekers are matched, and every wedding is complete at Y: the household has moved and the alliance or heiress union is settled.
5. **Conceptions.** Each married couple in scope is projected once over `[Y, Y+1)`, in person order; the marriage-alliance review runs again; the next pass is queued.

## Life

- **Death is decided by health, year by year.** Nobody has a death date at birth. Each yearly pass ages the living and projects death over the coming year from their effective health and a background hazard; see [health](health-and-mortality.md).
- **Other deaths** are immediate: a fatal delivery, a failed heart, a ruler killed leading a battle. Every death, of a seat holder or not, is applied at its own time by one death event ([families](families-and-lifecycle.md#death)).
- **Health bands** follow effective health: Dying, Near death, Poor, Fine, Good, Excellent.
- **Births** come from pregnancies (see Pregnancy). Only couples where one spouse is a ruler or a ruler's child keep having children.
- **Dynasty** follows the father, or the mother in matriarchal cultures. It falls back to the other parent when the first has none. Dynasties spread only through births.
- **Names** are drawn from the home culture. The name seed is redrawn until the name's gender matches the person's sex.

## Pregnancy

`FERTILITY.project` steps month by month through the coming year for each married couple in scope and queues the pregnancies it finds; the children are created when each pregnancy ends ([families](families-and-lifecycle.md#pregnancy)). `nextBirth` carries the spacing across years.

- **Who.** Both parents alive, capable and 16+, the mother under 45 at the due date, not within 3 months of her last pregnancy's end, and the couple's living children below their cap.
- **Monthly chance.** Mother: `max(0, fertility − 0.05 × her earlier children)` × her age factor (1 to 25, 0.9 to 30, 0.7 to 35, 0.5 to 40, 0.33 to 45, else 0.1). Father: `fertility` × his age factor (1 to 35, 0.9 to 40, 0.8 to 50, 0.7 to 60, 0.6 to 70, else 0.5). The chance is `clamp(((mother + father) / 2 + bonus) × 0.0475, 0.01, 0.25)`, × 0.85 unless one spouse holds a seat. The bonus is 0.3 for a seat holder's first child.
- **Trait and stress fertility effects.** Each parent's fertility term is multiplied by `max(0, 1 + active trait fertility sum)`, by the stress fertility factor (1, 0.9, 0.7, 0.5) and by the Infirm fertility factor (−10% per row reached). Carried traits contribute nothing.
- **Outcome**, as weights out of `N + 17`: normal birth N = 215 (−10 if the mother's health is 5 or below, −25 if 3 or below; +5 with 2+ earlier children, +5 more with 4+); miscarriage 10 (80–120 days); stillbirth 3 (180–200 days); mother dies 2 (the child is born at 280 days and she dies at the birth); mother and child die 2 (180–200 days). About 1.5% of pregnancies kill the mother.
- **Twins**, on a live birth: 4% if the mother is 25–35, else 2%; +5% if she has had twins, +3% if her mother has. Girls are 49%.
- **Standing** of a seat is its title tier + 1 (1 for a county seat, up to 5 for a hegemony). A couple's standing is the highest `peak` among the spouses and their parents.
- **Cap on living children** by standing 0–5: 1, 2, 3, 5, 5, 8; +2 if a spouse holds a seat; −1 for about half of couples (a fixed hash of the pair).
- **Record.** Miscarriages, stillbirths and childbirth deaths are `pregnancy` rows. They show only on the mother's page ("miscarriage", "stillborn child", "died in childbirth"); a reigning queen's death reaches her realm only as its succession.

## Pregnancy projection and delivery

`FERTILITY.project` steps month by month through the coming year for a couple and queues each pregnancy it finds. The chance, the cap on living children and twins are in [simulated people](families-and-lifecycle.md#pregnancy).

- **Decided at conception.** The outcome (birth, miscarriage, stillbirth, mother dies, mother and child die), twins and the end date are fixed then and never rerolled. The realm origin the child will take is captured then too.
- **Queued, not created.** A pregnancy is a pending delivery indexed by its mother. The mother rests until a season after it ends, so an early loss can be followed by another conception in the same year.
- **Counts.** Pending children count toward the mother's earlier births and the couple's living children from their due date, twins twice. A pending child is assumed to live through the year for the cap.
- **A fatal pregnancy stops projection** for that mother, in that pass and in later ones while it is pending. Her death is not set until the delivery.
- **Once per interval.** A couple projected for a year is not projected for it again.

Health is read at the yearly pass: complication weights use the mother's health then, held for the year.

### Delivery

The `BIRTH` event runs at the pregnancy's end.

- It is ignored if the delivery was cancelled. It is rejected if the mother has died or the father was dead at conception; a father who died after conception does not stop the birth. A rejected pregnancy frees the mother from its conception date.
- A birth creates one or two children at that moment: parents linked, character and health drawn, a first partial year of mortality projected, residence taken from where the mother lives now.
- A loss writes its `pregnancy` row. A fatal delivery creates the children first and then kills the mother with cause `childbirth`.

### Backfill

`FERTILITY.bear` gives founders, their siblings and their spouses the children they would have had, in historical order, delivering each as it is conceived. A pregnancy that would end after the present is left pending instead and delivered by its `BIRTH` event. Historical children use the mother's residence at their birth.

## Founding a house

`FAMILY.found` creates a new ruler of a given age with a fresh dynasty:
- a father who has already died and a mother who lived at least to the founder's birth, with siblings after the parents' wedding, kept clear of the founder's own pregnancy;
- the father and the founder take the standing of the seat the house is founded for, which sets the family's size;
- with 85% chance (if 18+), a spouse from outside and their children so far.

This runtime founder operation supplies later new throne, district and patrician houses. Starting holders instead use the dated construction below. Each created person's health is aged from birth to the present, and death is drawn only from the date they are known to have reached ([health](health-and-mortality.md#people-created-with-a-past)).

Starting ruler ages: 1–10 (weight 0.4), 11–15 (0.2), 16–30 (5), 31–50 (4), 51–65 (1). About 6% start as children, close to the 4–6% share of child rulers once successions settle.

## Starting families

`engine/backfill` builds sovereign ancestry during state creation, after territorial assignment and before population, economy, military and diplomacy. District grants and patrician appointments follow those passes. Original world seed and canonical seat/role paths supply keyed hash sources; neither people stage nor the initial betrothal pass draws from the shared simulation stream. Names, base fertility and pregnancy opportunities have separate sources. Final live IDs are allocated parent-first; inherited traits see final ancestry, without reparenting or redraws.

Holder ages keep the existing distributions. Parents are born 20–40 (father) and 17–32 (mother) years earlier. A sovereign's synthetic accession is initialization time minus a uniform draw from zero to the lesser of age and 30. The predecessor dies at accession; their tenure start is unknown. Proposed relations are child 70%, older full sibling 8%, uncle/aunt 5% and unrelated 17%, with sex following cultural preference. Sibling spacing is conditioned on both parents being 16+ at the older birth. Passed-over parents die after their last required child and by accession. District and patrician families have dead fathers by initialization and no invented predecessor tenure. These are initialization approximations, not simulated historical elections.

Adjacent sovereign pairs have a 25% cousin proposal chance before diplomacy. Priority-ordered feasible disjoint pairs share actual grandparents; established paternal ancestry is preserved. Father births must differ by gestation plus rest through 12 years. Shared grandparents are born 28/25 years before the older father and survive both reserved births. Cousins need not share a dynasty in matriarchal cultures. There are no district cousin proposals or starting personal unions.

Both unparented anchor lineages receive distinct dynasties, including non-transmitting maternal roots. All descendants use the ordinary gender-aware dynasty operation; outsider spouses remain dynasty-less. Singleton maternal dynasties are retained identities, separate from occupied ruling houses.

An anchor-parent wedding is proposed one year before the earliest reserved birth. Failure of age, survival, kinship or reciprocal scoring retains known parentage without a wedding or extra children. Founder first-marriage participation is 85% at 18+; wedding ages are 18–25 for men and 16–25 for women, bounded by initialization. Opposite-sex outsider ages use the market's existing 0–8-year gap and clamp (women 16–44, men 18–69). Every historical wedding uses `BACKFILL_MARRIAGE.acceptable`; held and projected standing and alliance value are zero because materialization precedes installation. Initial betrothals retain ordinary live inheritance projection.

After widowhood, annual opportunities begin one year after spouse death, with 35% participation. Adult children and siblings have the same annual opportunities from their eligible minimum ages. Each opportunity proposes one candidate; rejected candidates remain recorded people with no wedding or children. There are at most two historical marriages per person. Children may produce grandchildren and siblings nephews/nieces; those terminal descendants receive no historical spouses or offspring. A terminal relative later selected for a district keeps that existing family and enters normal runtime matching.

Historical fertility reuses gestation, rest, maternal limits, caps, outcomes and twins. Reserved births block competing pregnancies; required survival/death anchors stay fixed. The couple cap still hashes final person IDs. Cross-start pregnancies remain pending with no unborn person. Health replay uses final traits and parents with survival conditioning; it reads present health for historical pregnancies. Only surviving people's final starting condition snapshots are emitted, without earlier health-transition histories.

District grants retain the 30% preference for an eligible landless relative other than the apparent heir, and existing seat score order. Each recipient is installed before the next selection, so reused relatives have one identity and complete holdings. Fresh district families precede installation; the existing 3–5 patrician slots follow grants. Both stages reconcile surviving households and clear ended live spouse pointers. Historical weddings and moves retain their effective dates in the ordinary person log.

The detailed report's `diagnostics.startingFamilies` separates predecessor proposals/results, cousin proposals/rejection reasons, initial living/dead people, holder kinds, dynasty roots/singletons/occupied houses, retained rejected candidates, prior marriages and kin observations across holders. Stage timings are milliseconds. Retained bytes measure collected copies of the actual starting people/record/skeleton structures; rejected-column bytes omit scheduling and indexes. Sampled initialization heap is the whole process heap, including the generated world and diagnostic copies, not an isolated family peak. Memory-measurement time is reported separately. The saved P5 report has no equivalent startup retention measurements.

## Death

`DEATH_SCHEDULE` keeps one live token per person with a finite death date: a revision, a due time and a cause (`natural`, `heart`, `battle`, `childbirth`). A date that moves gets a new revision and the old heap event goes stale. A person with no date has no token, and nothing is ever queued for `Infinity`. People created already dead are never scheduled. Losing a last seat does not cancel a death.

`PERSON_DEATH.run` applies an accepted token once, in this order:

1. The death row is written with its cause; the betrothal is released; both spouse pointers are cleared; the spouse and parents are noted as bereaved for the next stress step; a mother's pending deliveries are cancelled.
2. The frozen seat walk passes on every seat the person held ([household residence](../politics/government-and-succession.md#holder-death-scheduling)).
3. Each regency the person held as regent is given to the next in order.

A stale or replaced token does nothing. `PERSON_DEATH.kill` is the immediate path for a battle or a delivery: it dates the death to now, replaces the token and runs it at once. A seat that reaches someone whose death was already applied gets a walk for that seat alone, with no second death row.

## Event order

At equal times the heap runs deaths, then births, then every other event, then the yearly people pass; ties within a class run in the order they were queued. The heap sorts on the time and on one number that folds the class and the queue order together; an event's payload sits in a slot that never moves. So a death at a delivery's time cancels it, births and deaths at a year boundary precede that year's pass, and weddings precede that pass's conceptions. Battle and childbirth deaths apply inside their own event.

## Approximations

- Health, status and origin are frozen at the yearly pass for the year's conceptions.
- A newborn's first partial year of mortality is drawn at delivery, not at conception.
- A later death that was not foreseen cancels deliveries; it does not reopen the year's rolls.
- Backfilled pregnancies read the mother's present health, not her health then.

## Consort families

Conception uses a woman's primary spouse or, when she has none, her patron. Consorts' children use the ordinary birth, genealogy and succession paths. Starting-family and backfill couples remain opposite-sex and monogamous; their children still draw orientation. See [marriage and kinship](marriage-and-alliances.md#religion-kinship-and-consorts).

# Families: weddings, births and deaths (`:history`)

When family events take effect. See [people](people.md) for who marries and who is tracked, [health](health.md) for how death is decided, [households](households.md) for the seat walk a death runs and for residence, and [people records](people-records.md) for the rows written.

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

## Pregnancy

`FERTILITY.project` steps month by month through the coming year for a couple and queues each pregnancy it finds. The chance, the cap on living children and twins are in [people](people.md#pregnancy).

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

## Death

`DEATH_SCHEDULE` keeps one live token per person with a finite death date: a revision, a due time and a cause (`natural`, `heart`, `battle`, `childbirth`). A date that moves gets a new revision and the old heap event goes stale. A person with no date has no token, and nothing is ever queued for `Infinity`. People created already dead are never scheduled. Losing a last seat does not cancel a death.

`PERSON_DEATH.run` applies an accepted token once, in this order:

1. The death row is written with its cause; the betrothal is released; both spouse pointers are cleared; the spouse and parents are noted as bereaved for the next stress step; a mother's pending deliveries are cancelled.
2. The frozen seat walk passes on every seat the person held ([households](households.md#succession)).
3. Each regency the person held as regent is given to the next in order.

A stale or replaced token does nothing. `PERSON_DEATH.kill` is the immediate path for a battle or a delivery: it dates the death to now, replaces the token and runs it at once. A seat that reaches someone whose death was already applied gets a walk for that seat alone, with no second death row.

## Event order

At equal times the heap runs deaths, then births, then every other event, then the yearly people pass; ties within a class run in the order they were queued. So a death at a delivery's time cancels it, births and deaths at a year boundary precede that year's pass, and weddings precede that pass's conceptions. Battle and childbirth deaths apply inside their own event.

## Approximations

- Health, status and origin are frozen at the yearly pass for the year's conceptions.
- A newborn's first partial year of mortality is drawn at delivery, not at conception.
- A later death that was not foreseen cancels deliveries; it does not reopen the year's rolls.
- Backfilled pregnancies read the mother's present health, not her health then.

# Families, births and lifespans

Scope: `:history`.

These rules govern the lives and kinship of [simulated people](overview.md). [Marriage](marriage-and-alliances.md) owns partner selection; [succession](../politics/government-and-succession.md#holder-death-scheduling) owns holder death scheduling.

Code: `src/model/history/sim/people/family`, `fertility`, `lifespan` and `health`.

## Life

- **Death is fixed at birth** (`LIFESPAN.deathAt`). Yearly hazard: 10% under 1, 3% under 5, 0.5% under 16, then 1.2% under 40 for both sexes, then Gompertz ageing (1.2% × e^(0.09 × (age − 40))). Nobody lives past 100.
- **Only childbirth moves a death date**, and only earlier (`PEOPLE.shortenLife`). The new date goes to the record as a `death` row. Every holder's person-level succession, including district-only holders, and a regent's replacement are rescheduled to the new date. Holder revisions reject stale heap events; regent events remain separate.
- **Health is read back from the death date** (`HEALTH.band`): Grave in the last half year, Poor in the last 2 years of a life ending at 40+, Fair in the last 6 years of a life ending at 50+, else Good. A mother whose pregnancy will kill her reads Poor or Grave during it, which gives a reigning queen a weak crown in her last months.
- **Births** come from pregnancies (see Pregnancy). Only couples where one spouse is a ruler or a ruler's child keep having children.
- **Dynasty** follows the father, or the mother in matriarchal cultures. It falls back to the other parent when the first has none. Dynasties spread only through births.
- **Names** are drawn from the home culture. The name seed is redrawn until the name's gender matches the person's sex.

## Pregnancy

`FERTILITY.bear` steps month by month through the coming year for each couple in scope. Children are created at conception with their due date as their birth; `nextBirth` carries the spacing across years.

- **Who.** Both parents alive and 16+, the mother under 45 at the due date, not within 3 months of her last pregnancy's end, and the couple's living children below their cap.
- **Monthly chance.** Mother: `max(0, fertility − 0.05 × her earlier children)` × her age factor (1 to 25, 0.9 to 30, 0.7 to 35, 0.5 to 40, 0.33 to 45, else 0.1). Father: `fertility` × his age factor (1 to 35, 0.9 to 40, 0.8 to 50, 0.7 to 60, 0.6 to 70, else 0.5). The chance is `clamp(((mother + father) / 2 + bonus) × 0.0475, 0.01, 0.25)`, × 0.85 unless one spouse holds a seat. The bonus is 0.3 for a seat holder's first child.
- **Trait and stress fertility effects.** Each parent's fertility term is multiplied by `max(0, 1 + active trait fertility sum)` and by the stress fertility factor (1, 0.9, 0.7, 0.5). Carried traits contribute nothing.
- **Outcome**, as weights out of `N + 17`: normal birth N = 215 (−10 if the mother's health is Poor, −25 if Grave; +5 with 2+ earlier children, +5 more with 4+); miscarriage 10 (80–120 days); stillbirth 3 (180–200 days); mother dies 2 (the child is born at 280 days and she dies at the birth); mother and child die 2 (180–200 days). About 1.5% of pregnancies kill the mother.
- **Twins**, on a live birth: 4% if the mother is 25–35, else 2%; +5% if she has had twins, +3% if her mother has. Girls are 49%.
- **Standing** of a seat is its title tier + 1 (1 for a county seat, up to 5 for a hegemony). A couple's standing is the highest `peak` among the spouses and their parents.
- **Cap on living children** by standing 0–5: 1, 2, 3, 5, 5, 8; +2 if a spouse holds a seat; −1 for about half of couples (a fixed hash of the pair).
- **Record.** Miscarriages, stillbirths and childbirth deaths are `pregnancy` rows. They show only on the mother's page ("miscarriage", "stillborn child", "died in childbirth"); a reigning queen's death reaches her realm only as its succession.

## Founding a house

`FAMILY.found` creates a new ruler of a given age with a fresh dynasty:
- a father who has already died and a mother, with siblings from the mother's 16th birthday onward, kept clear of the founder's own pregnancy;
- the father and the founder take the standing of the seat the house is founded for, which sets the family's size;
- with 85% chance (if 18+), a spouse from outside and their children so far.

Founders are used for starting rulers, new houses taking a throne, new district holders and new patrician houses.

Starting ruler ages: 1–10 (weight 0.4), 11–15 (0.2), 16–30 (5), 31–50 (4), 51–65 (1). About 6% start as children, close to the 4–6% share of child rulers once successions settle.

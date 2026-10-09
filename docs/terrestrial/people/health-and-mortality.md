# Health, ageing and mortality

Scope: `:history`.

Health determines survival and ageing conditions for [simulated people](overview.md). [Families](families-and-lifecycle.md) owns birth and death event effects; [attributes and traits](attributes-and-traits.md) describes personal modifiers.

How a person's health changes, which conditions old age brings, and how death is decided. See [simulated people](overview.md) for who is simulated, [families](families-and-lifecycle.md) for births, deaths and their events, [attributes and traits](attributes-and-traits.md) for attributes and traits, and [person records](../mechanics/person-records.md) for what reaches the record.

Code: `src/model/history/sim/people/health` (`HEALTH`), `health/ageing` (`AGEING`), `lifespan` (`LIFESPAN`); the yearly pass is called from `src/model/history/sim/engine/events/people`.

Values marked CK3 are read from the game files (`common/defines/00_defines.txt`, `common/traits/00_traits.txt`, `common/on_action/health_on_actions.txt`, `events/health_events.txt`). Everything else is this simulation's design.

## Health

- **Base health** at birth is `4.5 + 0.5u`, plus 0.5 for women (CK3 `NChildbirth`). It only ever falls.
- **Effective health** is base health plus the active trait modifiers (congenital traits, the physique grade, personality) and the health modifiers of the person's conditions, never below 0. Trait modifiers are added when health is read; they are not baked into the base.
- **Ageing.** From physiological age 25, each completed year has a `min(1, 0.075 + 0.022 × (age − 25))` chance of a permanent loss of 0.125 (CK3 `NOldAge`). Physiological age is the person's age plus the life expectancy their Fragile Bones has cost them (design: CK3 moves a death date, which the simulation does not have).
- **Bands** follow effective health (CK3 `HEALTH_STATE_LEVELS_VALUES`): Dying at 0 or below, Near death up to 1, Poor up to 3, Fine up to 5, Good up to 7, Excellent above. A boundary value belongs to the lower band.

No death date is fixed at birth. A living person's `death` is `Infinity` until a yearly pass chooses a date inside the coming year.

## Simulation columns

Ten `number[]` columns per person: `baseHealth`; `infirmXp`, `cloudedEyesXp`, `fragileBonesXp`, `witheringMindXp`, `falteringHeartXp` (−1 when absent, else 0–100); `healthFlags` (the last recorded band, the Blind and Incapable bits, and a bit for having led an army since the last pulse); `healthAgeYear` (the last completed age processed); `healthIntervalEnd` (death has been projected up to this time); `ledYear` (the calendar year last led in battle). Exact health and XP stay in the simulation; the record holds bands and levels.

## Rolls

Every health roll is `HASH.unit` on the person's `nameSeed`, a channel and a salt. None draws from the shared rng.

| Channel | Roll | Salt |
|---|---|---|
| 1000 | birth health | 0 |
| 1001 | yearly ageing loss | completed age |
| 1002, 1003, 1004 | death in an interval: whether, which month, when in the month | world year |
| 1005, 1006 | a newborn's first partial year: whether, when | world year |
| 1011–1014 | susceptibility to Clouded Eyes, Fragile Bones, Withering Mind, Faltering Heart | 0 |
| 1020–1024 | yearly progression of the five ageing conditions | completed age |
| 1030–1034 | yearly onset of the five conditions | completed age |
| 1040 | death while leading a battle | battle time |

Channels 1–6 are attributes, 100–132 personality and 200 upwards congenital traits.

## The yearly pass

`HEALTH.runYear` runs in the people pass over everyone alive with no death date. For the pass at year Y:

1. **Age pulses.** Each completed age not yet processed, up to `floor(Y − birth)`, runs once: the ageing loss, then each existing condition's progression, then each onset. A person therefore gets their pulse at the first pass after their birthday. A condition gained in a pulse first progresses in the next.
2. **Band.** If the band changed, it is logged.
3. **Death projection** over `[Y, Y+1)` at the health just computed, held constant for the year.

### Mortality

Two hazards combine:

- **Health** (CK3 `DIE_HEALTH_TRESHOLD`, `DIE_HEALTH_CHANCE_ZERO`): below health 3, a monthly chance `0.25 × ((3 − h) / 3)²`. The quadratic shape between the two CK3 values is an interpretation, not confirmed engine arithmetic.
- **Background**, a yearly chance standing in for disease, which the simulation does not model: 0.1 before age 1, 0.03 at 1–4, 0.005 at 5–15 and 0.012 from 16.

Survival over `dt` years is `(1 − background)^dt × (1 − p)^(12 dt)`. An interval is split at the 1st, 5th and 16th birthdays it crosses, so every child gets exactly one year at 0.1, four at 0.03 and eleven at 0.005 whatever their birth date: survival to 16 is `0.9 × 0.97⁴ × 0.995¹¹ ≈ 0.754`. One roll decides whether the person dies in the interval. A death falls in a segment by that segment's share of the deaths, in a month by the survival within the segment, and evenly within what the segment keeps of that month. The date is always after the interval's start.

`healthIntervalEnd` keeps the intervals contiguous. A person born at `b` is covered for `[b, ceil(b))` at birth, with the newborn channels, and from the next pass on for whole years.

## People created with a past

Founders, outsider spouses and backfilled relatives are created as adults or as children born years ago. `HEALTH.replay` ages them from birth to the present with the same age-keyed rolls a living person gets, and projects death only from the date they are known to have been alive (`survives`): a founder's coronation, a spouse's wedding, a mother's delivery. A relative with no such constraint can come out already dead, with a real past death date, or alive.

This conditions survival on nothing else. A starter aged 60 keeps whatever health and conditions the replay gave them, so the first years of a run see a cluster of deaths among the old. During replay, heart progression is capped at 99 XP through the known survival date, so a historical heart failure cannot contradict that survival. Subsequent pulses can reach the fatal threshold.

The record gets the band and conditions a living starter has when created, not the history of how they came by them.

## Ageing conditions

Five conditions, each a track of XP 0–100 with levels at 25, 50, 75 and 100 (CK3 trait tracks). A person can have none, one or several.

### Onset

CK3 rolls one event a year from a pool; the simulation rolls each condition separately with yearly chance `min(1, 0.75 × weight / 885 × age factor × health factor)`. Four of the five can only ever begin for 80% of people (CK3's `static_group_filter`, read as a fixed 80% per person).

| Condition | Can develop it | From age | Weight | Age factor | Health factor |
|---|---|---|---|---|---|
| Infirm | everyone | 45 | 20 | ×2 above 60 | under 60: ×0 at health 5+, ×0.8 at 3+; any age: ×2 below 3, ×5 at 1 or below |
| Clouded Eyes | 80% | 45 | 20 | ×2 above 60 | under 60: ×0.7 at 5+, ×0.5 at 3+ |
| Fragile Bones | 80% | 45 | 30 | ×2 above 60 | as Infirm |
| Withering Mind | 80% | 50 | 30 | ×2 above 60, ×2 above 70, ×3 above 80 | under 60: ×0.1 at 5+, ×0.8 at 3+ |
| Faltering Heart | 80% | 45 | 30 | ×2 above 60, ×2 above 70, ×3 above 80 | as Infirm |

Every matching factor multiplies: health 5 also matches "3+", and health 1 matches both "below 3" and "1 or below" for ×10. The under-60 rows stop at 60 and the older rows start above their age.

### Progression

One roll a year picks an XP gain. A weight below 0 counts as 0.

| Condition | Yearly gain (weight) |
|---|---|
| Infirm | +8 (50, +25 from age 50, −25 at health 3+); +4 (60 + prowess); +12 (+50 from age 65, −25 at health 3+) |
| Withering Mind | +50 (9); +8 (48); +4 (75); +1 (10) |
| Fragile Bones | +3 (25); +6 (75); +12 (100 if the person led an army since the last pulse) |
| Clouded Eyes | +15 (5); +9 (20); +3 (75) |
| Faltering Heart | +2 (75); +4 (25); +8 (+25 from age 65, +25 below health 3) |

The Withering Mind constants fold in CK3's terms for having no friends, lovers or wards, and Infirm's first weight folds in "not athletic"; the simulation has none of those.

Faltering Heart uses a simulation-specific rule independent of stress: a baseline mean of 2.5 XP/year, rising to 3.6 with either age 65+ or health below 3, and about 4.33 with both. The gains reuse the yearly pulse and 25-XP levels to make baseline decline slow (roughly 40 years from onset), while advanced age and poor health shorten it (roughly 23 years with both). These are design values, not CK3 progression or medical estimates. At 100 XP, death is scheduled at that yearly pass with cause `heart`, ahead of natural mortality projection.

### Effects

Levels are cumulative: a person has the base row and the row of every level reached.

| Condition | Base | Level 1 | Level 2 | Level 3 | Level 4 |
|---|---|---|---|---|---|
| Infirm | diplomacy −1, martial −1, prowess −20%, fertility −10%, health −0.25 | diplomacy −1, martial −1, stewardship −1, prowess −20%, fertility −10%, health −0.25, attraction −5 | diplomacy −2, martial −2, stewardship −2, prowess −20%, fertility −10%, health −0.25, attraction −5 | as level 2 | as level 2 |
| Clouded Eyes | martial −1, prowess −2 | as base | as base | martial −1, stewardship −1, intrigue −1, prowess −2, attraction −5 | Blind |
| Fragile Bones | prowess −10%, advantage −3, life −3 years | as base | as base | prowess −10%, advantage −5, life −5 years | prowess −10%, advantage −10, life −10 years |
| Withering Mind | learning −2 | the five skills −25% | as level 1 | as level 1 | as level 1; Incapable |
| Faltering Heart | prowess −1, health −0.1 | as base | as base | as base | death |

Percentages are summed before the total factor is clamped at 0. The summed effects depend only on the levels, so each combination is computed once and shared.

### Terminal states

- **Blind** (Clouded Eyes at 100): martial −6, stewardship −2, intrigue −2, prowess −10, health −0.25, attraction −10. Clouded Eyes is removed. Permanent.
- **Incapable** (Withering Mind at 100): all six attributes 0, health −2. Permanent. An incapable person cannot be a regent, be elected or appointed, lead an army or conceive; they can still inherit. A sovereign gets a regent ([simulated people](../politics/government-and-succession.md#regencies)).
- **Heart failure** (Faltering Heart at 100): death at that yearly pass.

Conditions never heal. In the standalone kernel (200000 lives from 16, no traits, prowess 6), 5.3% of those who reach 50 become Incapable, for half a year on average, and 1.0% Blind; the median adult death is at 59 for men and 62 for women.

## Other uses of health

- **Pregnancy.** The weight of an untroubled birth is 215, less 10 at health 5 or below and a further 15 at 3 or below ([families](families-and-lifecycle.md#pregnancy)). A backfilled historical pregnancy reads the mother's present health.
- **Ailing crown.** A ruler below health 2.5 has a weak crown ([rebellion](../politics/rebellions-and-throne-wars.md)). 2.5 rather than the Poor band's 3 keeps the weak period near two to three years.
- **Command.** A ruler leads an army in person only above health 3 and without Infirm, Blind or Incapable ([military](../politics/armies-and-wars.md#command)).

## Record

A person's creation carries their band at that moment. After that the log has a `health_band` row when the band changes and a `condition` row when a condition is gained, changes level or is lost. Changes in one yearly pass are written in condition order, then the band. `PERSON_QUERY.health` and `.conditions` read only those rows: there is no health for a starter before the simulation began, none for the dead, and none for someone created already dead. See [person records](../mechanics/person-records.md).

## Measurements

See [health and lifecycle benchmark results](../mechanics/pipeline-performance.md#health-and-lifecycle-benchmark-p4) and [health and lifecycle memory measurements](../mechanics/record-memory.md#health-and-lifecycle-retention-p4).

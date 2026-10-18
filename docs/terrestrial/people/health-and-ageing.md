# Health and ageing

`HEALTH.life` runs one life year by year from birth to death or to `record.maxTimeMs`, and returns dated band and condition rows plus the death date and cause. Rolls are hash draws keyed by person and age, so a life is the same whenever it is computed.

## Rules

- Base health `4.5 + 0.5u`, plus 0.5 for women (CK3 `NChildbirth`).
- From physiological age 25 a yearly loss of 0.125 with chance `min(1, 0.075 + 0.022 × (age − 25))` (CK3 `NOldAge`). Fragile Bones adds its lost life expectancy to the age.
- Bands: Dying ≤ 0 < Near death ≤ 1 < Poor ≤ 3 < Fine ≤ 5 < Good ≤ 7 < Excellent (CK3 `HEALTH_STATE_LEVELS_VALUES`).
- Effective health is base health plus personality, congenital and physique modifiers plus the condition effects, never below 0.
- Five ageing conditions with onset age, pool weight, share of people who can develop them and per-year progression: Infirm (45), Clouded Eyes (45), Fragile Bones (45), Withering Mind (50) and Faltering Heart (45). Clouded Eyes reaching 100 XP becomes Blind; Withering Mind reaching 100 becomes Incapable; Faltering Heart reaching 100 is a heart death (CK3 `health_on_actions.txt`, `00_traits.txt`).
- Mortality each year: a monthly `0.25 × ((3 − h)/3)²` below health 3 (CK3 `DIE_HEALTH_TRESHOLD`, `DIE_HEALTH_CHANCE_ZERO`), plus a background yearly 0.1 under 1, 0.03 at 1–4, 0.005 at 5–15 and 0.012 from 16.

## Anchored lives

Mortality applies only after `survivesMs`, the latest date the person is known to be alive. A ruler with a recorded natural death passes `fixedDeathMs`: health death is off until then, Faltering Heart is capped at 99 XP until then, and the record's date is used. A deposed ruler is anchored only to the deposition. A ruler still reigning at the horizon has no death.

Diseases, wounds and battle death are not modeled. Attribute effects of conditions are not modeled; only health, fertility and life-expectancy effects remain.

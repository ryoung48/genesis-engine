# Character and opinion

## Personality

Three of 36 CK3 personality traits in 17 groups, active at ages 9, 11 and 13. Each person draws three groups by hashed rank and one trait in each group. A parent trait raises its own chance by the parent bias, 0.4 (Vukasovic & Bratko 2015): `share + 0.4 × (1 − share)` for the inherited trait, `share × 0.6` for its group-mates. Eccentric has weight 0.05.

## Congenital traits and grades

Fifteen congenital traits (giant, dwarf, clubfooted, hunchbacked, spindly, lisping, stuttering, bleeder, wheezing, infertile, scaly, albino, depressed, lunatic, possessed) and three graded ladders (intellect, physique, beauty). Each has an active or carried gene state. Inheritance chances by parent state: active + active 80%, active + carried 50%, active + none 25%, carried + carried 10%, carried + none 2%. Without parents the birth chance is 0.5% per congenital trait and the per-grade birth chances in `CHARACTER` apply (CK3 1.19.0.6 `common/traits/00_traits.txt`, `common/defines/00_defines.txt`). Inbred, Pure-blooded and the six base attributes are not modeled.

Spouses and generated parents always use the no-parent rule. Everyone else inherits from their parents, so the inheritance recursion ends at the first spouse or generated ancestor.

## Orientation

Every person has a lifelong orientation from hash channel 420: heterosexual 89%, homosexual 5%, bisexual 5%, asexual 1%. The page shows it from age 18. It changes neither marriage eligibility nor fertility.

## Opinion

`OPINION.of` returns the viewed person's opinion of a family member, clamped to ±100:

- personality: +5 per shared trait, −5 per opposing pair in a group;
- culture: +10 same culture, else +5 same heritage;
- religion: +15 same religion at the date;
- reputation: Sadistic or Albino −10 each;
- kin: +10 for a parent, child or sibling;
- spouse: +10 while married.

The breakdown is shown in the chip tooltip.

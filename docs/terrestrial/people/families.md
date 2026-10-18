# Marriages, fertility and children

## Marriages

Only house members (rulers and people born to a house member) search for marriages. A lowborn or conjured spouse has exactly the marriages that others give them. `MARRIAGE.extend` continues a person's search from where it stopped to a date, then advances the fertility of each of their marriages to that date; it never rewrites anything before the date. The search state (`cursorMs`, the betrothal age, the plural age) lives on the person.

1. Betrothal comes first: a house member aged 12–15 is promised with 35% chance a year (CK3: the AI betroths no one under 12 and the betrothed marry at 16; age gap at most 5 years). The spouse is aged 12–20; the wedding is at the later of both 16th birthdays, and the betrothal is a timeline row and a "Betrothed" family entry from its date. Betrothals carry no alliance here.
2. Free marriages fill the rest. A seeker is an unmarried or widowed woman aged 16–44 or man aged 18–69; a widowed seeker starts one year after the death. Each year the seeker marries with chance 0.35 (`MARKET_CHANCE`). The spouse comes from the [cast first](nobility.md#choosing-a-spouse); a conjured spouse is of the opposite sex, aged the seeker's age plus a gap of 0–8 years (older husband), clamped to the same bounds.
3. A free marriage that would overlap another exclusive marriage of the seeker is rejected. The same holds for the chosen spouse: only people not married or betrothed over the span are candidates.
4. A planned child that no existing marriage can bear forces a marriage (or, for a man, a concubine) a few months before the conception; see [anchors](anchors.md#heir-plans).

## Children

`FERTILITY.advance` steps month by month through a marriage while both spouses live and resumes from where it stopped:

- chance `clamp(((mother + father)/2 + bonus) × 0.0475, 0.01, 0.25)`, times 0.85 unless one spouse rules; fertility 0.5–0.6, age factors, trait and condition multipliers; first-heir bonus 0.3 for rulers;
- the mother must be under 45, with a 3 month rest after each pregnancy; an Incapable spouse stops the marriage's fertility;
- outcome weights: birth 215 (−10 at health ≤ 5, −25 at ≤ 3, +5 at 2+ earlier children, +5 more at 4+), miscarriage 10, stillbirth 3;
- twins 4% for mothers aged 25–35, else 2%; girls 49%; gestation 280 days;
- cap on living children: 1, 2, 3, 5, 5, 8 by standing, +2 if a spouse rules, one fewer for half of couples (fixed per pair);
- a conception whose delivery lies beyond the record's horizon waits until the record reaches it.

Planned children (from [heir plans](anchors.md#heir-plans) and ladders) are placed at their recorded births and override spacing, cap and the Incapable stop. Free conceptions fill around them and keep the rest on both sides. A plan owner's marriages conceive no free birth inside the plan's blocked interval.

**Childbirth reinterprets a death; it never creates one.** The mother's death date is fixed by her life. If it falls inside a free pregnancy at gestation day 180 or later, her cause becomes "Died in childbirth", the delivery moves to her death date and each child survives with chance 0.5. Earlier than day 180 the pregnancy ends with her and writes no row. Her death ends the marriage on the same date either way.

## Plural wives and concubines

A man's religion can allow more than one partner ([doctrines](religion-and-doctrines.md#effect-on-people)). A man aged 18–69 seeks each year with chance 0.35. If his religion's `marriage_type` is polygamy he takes an additional wife; if it is concubines he takes a concubine. He stops at his standing's limit (0, 0, 1, 2, 3, 3). The partner is a woman aged 16–44, up to 8 years younger. These marriages may overlap his other marriages. A plural wife is listed with the spouses; a concubine is listed under Concubines with the relation "concubine". Children are born by the same rules as any marriage.

## Marriages between relatives

Relatives are ordinary candidates for a marriage; nothing makes such a marriage more or less likely. The `consanguinity` doctrine sets which kinship a religion allows: restricted (none), cousins, aunt/nephew and uncle/niece, or unrestricted (also siblings and half-siblings). A person's bar is their home province's religion at age 25, so it is a fixed fact of the person. A pair is allowed when both partners' bars allow the kinship found between them, which is read from the parent links already in the cast, up to the grandparents (siblings and half-siblings by shared parents, uncle or aunt and niece or nephew, first cousins by a shared grandparent). A parent, child or grandparent is never allowed. The check never creates relatives; relatives created later come from outsiders or from a fitted birth, which cannot link two people already married.

## Dynasty of a child

The house member's dynasty when the other parent is an outsider. When both are house members, the father's, or the mother's when she is a ruler.

## Differences from the old person model

No pregnancy deaths drawn here ("mother dies", "mother and child die"). Earlier children count the marriage's children only. Standing is a constant (ruler 3, other house member 3, commoner 1).

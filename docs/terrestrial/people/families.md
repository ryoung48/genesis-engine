# Marriages, fertility and children

## Marriage chains

Only house members (rulers and people born to a house member) have a chain. An outsider spouse has exactly the marriage that created them.

1. Anchored marriages come first: a couple created from a record anchor starts at `max(first conception − 1 year, both 16th birthdays)`.
2. Free marriages fill the gaps. A seeker is an unmarried or widowed woman aged 16–44 or man aged 18–69; a widowed seeker starts one year after the death. Each year the seeker marries with chance 0.35 (`MARKET_CHANCE`). The spouse is drawn from the [noble pool](nobility.md) or, failing that, conjured as an outsider `S(owner,k)` of the opposite sex, aged the seeker's age plus a gap of 0–8 years (older husband), clamped to the same bounds. These are the values of the deleted market module, which its reports calibrated to first-marriage ages of about 18 (women) and 20 (men).
3. Betrothal comes first: a house member aged 12–15 is promised with 35% chance a year (CK3: the AI betroths no one under 12 and the betrothed marry at 16; age gap at most 5 years). The spouse is an outsider aged 12–20; the wedding is at the later of both 16th birthdays, and the betrothal is a timeline row and a "Betrothed" family entry from its date. A betrothal whose spouse or owner dies before the wedding, or that overlaps an anchored marriage, is dropped. Betrothals carry no alliance here.
4. A free marriage that would still be active when an anchored marriage starts is rejected.

## Children

`FERTILITY.couple` steps month by month through a marriage while both spouses live:

- chance `clamp(((mother + father)/2 + bonus) × 0.0475, 0.01, 0.25)`, times 0.85 unless one spouse rules; fertility 0.5–0.6, age factors, trait and condition multipliers; first-heir bonus 0.3 for rulers;
- the mother must be under 45, with a 3 month rest after each pregnancy; an Incapable spouse stops the marriage's fertility;
- outcome weights: birth 215 (−10 at health ≤ 5, −25 at ≤ 3, +5 at 2+ earlier children, +5 more at 4+), miscarriage 10, stillbirth 3;
- twins 4% for mothers aged 25–35, else 2%; girls 49%; gestation 280 days;
- cap on living children: 1, 2, 3, 5, 5, 8 by standing, +2 if a spouse rules, one fewer for half of couples (fixed per pair).

Anchored children are placed first at their recorded births and override spacing, cap and the Incapable stop. Free conceptions fill around them and keep the rest on both sides.

**Childbirth reinterprets a death; it never creates one.** The mother's death date is fixed by her life. If it falls inside a free pregnancy at gestation day 180 or later, her cause becomes "Died in childbirth", the delivery moves to her death date and each child survives with chance 0.5. Earlier than day 180 the pregnancy ends with her and writes no row. Her death ends the marriage on the same date either way.

## Plural wives and concubines

A man's religion can allow more than one partner ([doctrines](religion-and-doctrines.md#effect-on-people)). A man aged 18–69 seeks each year with chance 0.35. If his religion's `marriage_type` is polygamy he takes an additional wife; if it is concubines he takes a concubine. He stops at his standing's limit (0, 0, 1, 2, 3, 3). The partner is an outsider woman aged 16–44, up to 8 years younger. Plural marriages may overlap his other marriages and anchored marriages. A plural wife is listed with the spouses; a concubine is listed under Concubines with the relation "concubine". Children are born by the same rules as any marriage.

## Marriages between relatives

The `consanguinity` doctrine sets which kinship a religion allows: restricted (none), cousins, aunt/nephew and uncle/niece, or unrestricted (also siblings and half-siblings). A person's bar is their home province's religion at age 25, so it is a fixed fact of the person. A pair needs both partners' bars to allow the kinship.

Kin marriages are decided by the common ancestor, never by the partners, so every page agrees whatever order pages open in:

1. **Siblings**, by the parents' marriage: opposite-sex children of one marriage.
2. **Half-siblings**, by the shared parent: children of different marriages of that parent.
3. **Uncle/aunt with niece/nephew and first cousins**, by the grandparents' marriage: its children and its grandchildren through different children.

Each decision takes the relatives' ordinary marriages (see above) as already fixed and works in order: siblings, then half-siblings, then the grandparent level. Each eligible pair rolls once a year from the later partner's 16th birthday, with chance 0.25 (`PAIR_CHANCE`; chosen so such marriages stay rare, since the pair must also be unmarried and alive; the report measures the resulting share). A pair is accepted only if neither partner has an overlapping marriage, and conflicts go to the earlier wedding. Decisions run only when the ancestor couple's home religion allows the kinship at all, so pages in restricted religions pay nothing. The marriage appears in both spouses' chains and its children are ordinary children. Grandchildren born of a kin marriage are not themselves candidates in the same grandparent decision.

## Dynasty of a child

The house member's dynasty when the other parent is an outsider. When both are house members, the father's, or the mother's when she is a ruler.

## Differences from the old person model

No pregnancy deaths drawn here ("mother dies", "mother and child die"). Earlier children count the marriage's children only. Standing is a constant (ruler 3, other house member 3, commoner 1).

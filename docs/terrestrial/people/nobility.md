# Nobility, seats and the spouse search

Spouses are not all lowborn. Each person has a **rank** and a **residence**, and a marriage draws its partner from people already in the [cast](overview.md#the-cast) before anyone is created. The cast grows with what is clicked and its neighbourhood, so two sessions that open pages in different orders can produce different spouses. Facts already shown never change.

## Ranks and seats

| Rank | Tier | Seat |
|---|---|---|
| Baron | 0 | a location (from `world.locations`) |
| Count | 1 | a province |
| Duke | 2 | a duchy title |
| King | 3 | a kingdom title |
| Emperor | 4 | an empire title |
| Hegemon | 5 | a hegemony title |

A ruler's rank is the top title his realm holds at the time, plus one, and at least Count. Everyone else's rank inherits from their parents; people created without parents (conjured spouses and outsider parents) carry an explicit rank. Lowborn is -1. A house member with no title is a courtier. A person's residence is a province: a ruler lives at the capital, children at the parent's seat, a married-in spouse at the owner's seat, and a relative with no title at court (the capital).

## Choosing a spouse

When a marriage search at time t needs a spouse for a seeker:

1. With chance 0.05 (baron seeker) down to 0.005 (emperor) the spouse is lowborn and is conjured.
2. Otherwise a target rank is drawn. Weights by how far below the seeker it is: same 1, one below 0.5, two 0.2, three 0.08, further 0.03; one above 0.3. Rank is capped at one above the seeker's.
3. **Cast candidates.** The cast's people of that rank and the opposite sex who live in the seeker's realm or a bordering realm (25-year frame), are alive, unmarried and unbetrothed, are of age (a wife 16 to 44 and up to 10 years younger or 2 older; a husband 18 to 69 and up to 2 years younger or 10 older), whose marriages are not generated past t, and who pass both partners' [consanguinity bars](families.md#marriages-between-relatives). Among the candidates the one with the lowest hash over the seeker's seed is taken. Relatives are never created by this check.
4. **Conjured.** If no cast candidate qualifies, a noble of the target rank is conjured with a hash-derived dynasty and the seeker's home; the person has no parents in the tree, and their parents are created only if their page is opened. No family is built around the spouse.

The same search serves betrothals and plural wives and concubines.

## Limits

Constants are chosen for plausibility, not fitted; the report's `castSpouseShare` and `nobility` section measure the result. A spouse search creates at most the spouse; the seeker's marriage is the only link, so relatives of the seeker's spouse exist only once someone opens them.

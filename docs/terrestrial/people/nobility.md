# Nobility, seats and the spouse pool

Spouses are no longer all lowborn. Each person has a **rank** and a **residence**, and a marriage draws its partner from the nobles of the realm and its neighbours, with a conjured person only as a fallback. This layer is generated lazily and is **history-dependent**: the pool grows as pages and families are generated, so two sessions that open pages in different orders can produce different spouses. Facts already shown never change.

## Ranks and seats

| Rank | Tier | Seat |
|---|---|---|
| Baron | 0 | a location (from `world.locations`) |
| Count | 1 | a province |
| Duke | 2 | a duchy title |
| King | 3 | a kingdom title |
| Emperor | 4 | an empire title |
| Hegemon | 5 | a hegemony title |

A ruler's rank is the top title his realm holds at the time, plus one, and at least Count. Everyone else's rank inherits from their parents. Lowborn is -1. A house member with no title is a courtier. A person's residence is a province: a ruler lives at the capital, children at the parent's seat, a married-in spouse at the owner's seat, and a relative with no title at court (the capital).

## Seeding

When a marriage search needs a spouse at time t, the owner's realm is seeded for the 25-year bucket of t, together with every realm bordering it (one ring):

- Seats are the realm's held duchy-and-higher titles below its top title (except the capital's), and every province except the capital. Barons are not seeded; a baron spouse is conjured in the owner's province.
- The ruler's adult siblings and uncles or aunts each roll for a title (sibling 0.6, uncle or aunt 0.35). A winner takes the highest vacant seat of rank at most Duke. A loser stays at court. Sons and cousins are not assigned titles.
- Every other seat has a holder created on demand, a shallow stub: sex (85% male), age 36 to 62, a dynasty and the seat as home. With chance 0.4 in the king's realm and 0.25 in a neighbour the dynasty is the realm ruler's (a cadet branch with no tracked relation); otherwise it is a stable hash of the seat. Holders' parents and children are generated like anyone's.

## Choosing a spouse

1. With chance 0.05 (baron owner) down to 0.005 (emperor) the spouse is lowborn.
2. Otherwise a target rank is drawn. Weights by how far below the owner it is: same 1, one below 0.5, two 0.2, three 0.08, further 0.03; one above 0.3. Rank is capped at one above the owner's.
3. Up to six seats of that rank, taken in a hashed order, are tried. A seat's holder must have an unmarried house child of the right sex, of age (a wife aged 16 to 44 and up to 10 years younger or 2 older; a husband 18 to 69 and up to 2 years younger or 10 older), alive, unrelated within two generations of ancestors, whose chain has not been built and who has not been claimed. That child is claimed: a marriage is created with the real person and recorded.
4. If none qualifies, a person of that rank is conjured with the seat's dynasty and the owner's home. They have no parents in the tree.

Claimed people only: a chain already built is never changed, so no earlier page contradicts a later one. The claim also applies to betrothals and to plural wives and concubines.

## Limits

The cost is bounded by a recursion depth of 2: a spouse search made while a holder's own chain is being built does not seed further. Constants are chosen for plausibility (the lowborn share is measured in the report's `nobility` section), not fitted.

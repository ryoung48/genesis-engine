# Rebellion (`:history`)

Code: triggers and breakaway in `src/model/history/sim/engine/events/war` (`rebel`, `seedRebellions`) and `engine/events/succession` (`pretenderRevolt`, `weakCrownRevolt`, `restoration/`); rebellion threat in `engine/military` (`rebellionThreat`); release in `engine/state/index.ts` (`releaseProvince`, `fixConnections`); war endings in `engine/events/peace`; record text in `src/model/history/sim/record/translator`.

A rebellion is a district leaving its realm. The district and everything under it become a sovereign realm at once. The overlord may then fight a war to take it back. Every rebellion seeks independence: rebels never try to take the realm's throne.

## Who can rebel

A **district** is a seat whose parent is its sovereign (a direct report of the crown), with a titled seat (`seatRank > 0`) and a living holder. Crown demesne, sub-vassals and vacant seats never rebel.

## Rebellion threat

The threat compares the rebels' levy with what the crown can still field against them. It uses the cubed force share from [military](military.md#war-starts).

```text
share   = crown manpower × district subtree population / realm population
league  = Σ share of the crown's other districts
loyalty = 1 for settled realms, else 1 + 0.5 × (1 − treasury fill)

crown   = min(crown force, crown manpower − share)
rebels  = min(crown logistics cap, (share + 0.25 × league) × 0.9 × loyalty)
threat  = rebels³ / (crown³ + rebels³)
```

Other districts count at 25% because they may join. A tribal or steppe crown with an empty treasury pays its warriors poorly, so up to 50% more of them follow the rebels.

## Triggers

| Trigger | When | Test |
| --- | --- | --- |
| Seeded | At simulation start, for up to 1.25% of districts. The realm must not be at war. | Threat > 0.55. The war always starts, already under way. |
| District's own war event | Every 8–16 years. The realm must not be at war. | Threat test, laxity 0.1 under a weak crown. |
| Weak crown | After every succession with no pretender, and after a lord protector usurps. Districts are tried in random order, and at most one breaks away. | Threat test, laxity 0.05 per missing claim point below 3, plus 0.1 under a weak crown. |
| Pretender | A disputed succession, a lost election or a restoration attempt ([people](people.md#succession), [restoration](people.md#restoration)). | District backing (below). No threat test. The seat must still be a direct district of the realm. |

**Threat test.** The district breaks away when `threat > 0.55 − laxity`, and then only with chance equal to the threat.

A **weak crown** is a realm under a regent, or whose ruler is in Poor or Grave health ([people](people.md#regencies)).

## Support

Rebels are backed in three ways. None of them make other realms or districts actively intervene on the rebels' behalf.

- **District backing (pretenders only).** The realm's district holders vote between the incumbent (or heir) and the claimant. Each vote is weighted by the district's population. Each holder backs:
  - a candidate of their own house; otherwise
  - one tied to their house by marriage; otherwise
  - the stronger candidate. Strength is the candidate's district's share of the vote weight, plus 0.2 if they are aged 25–60. The incumbent counts no district weight.

  With at least 40% backing, the claimant revolts with chance equal to that share. The seat that rises is the claimant's own district, or failing that, their largest backer's. A losing election candidate needs a district of their own and 40% of the vote. Backers do not break away or fight: only the one seat leaves.
- **Sibling districts in the threat.** The crown's other districts add 25% of their levy to the rebels' side of the threat formula. They are a notional threat only: they stay in the realm and never join the war.
- **Allies in the war.** Rebels defend, so their allies join the war as they would for any defender ([military](military.md#deployment-and-coalition-strength)). A newly released realm has no allies, though. It gets them only if a diplomacy roll forms an alliance during the war, and a newcomer joins only if it is not exhausted and is out of debt. The crown attacks, so its allies stay out; only its diplomatic vassals and union partners fight for it.

## Breakaway

- **Resources.** The rebel realm takes the crown's manpower and positive treasury in proportion to its population.
- **Ruler.** The district's holder rules the rebel realm with claim 3 (founder). With no living holder, a new house is founded. In a pretender revolt, the pretender takes the rebel throne with claim 3, even when the district belonged to a backer.
- **Cut-off land.** Crown provinces left without a connection to their parent are released as well. They are recorded as `province released` and shown as a "disconnected" revolt.

## The rebel war

- **Whether it starts.** After a threat-based breakaway, the crown fights with chance `1 − threat`. Otherwise the district simply goes free. A pretender revolt always leads to a war.
- **Sides.** The **crown attacks and the rebels defend**. Only a war's attacker occupies land (see [military](military.md#battle-resolution)), so rebels can drive the crown back, but they never march on its capital.
- **Protection.** A realm will not declare war on a neighbor that is defending in another realm's rebel war.
- **No buy-off.** Rebels cannot buy peace.

## Endings

These are the rebel-war cases in `PEACE.terms`. Every ending sets a 10-year truce and leaves the two realms Suspicious.

| How it ends | Outcome |
| --- | --- |
| The crown takes the rebel capital | **Restoration**: the rebel realm returns in full. |
| The war stalls or runs out while the crown holds rebel land | **Independence**: the crown keeps what it occupies (a partial reconquest), and the rest of the rebels stay independent. |
| Anything else (crown driven back, both exhausted, no troops, no target) | **Independence**: a rebel war never ends in white peace. |
| The crown stops being sovereign while the rebels remain | **Independence**. |
| Otherwise, a leader stops being sovereign | **Lapsed**. |

## Record

- **Revolt text.** Each revolt adds a line to the rebel nation: "Revolted against X (cause, for pretender)". The cause is `threat`, `succession`, `restoration` or `disconnected`.
- **War name.** A rebel war is named "Suppression of the X Revolt". It becomes "X Civil War" when the rebel territory exceeds half the crown's area. It is recorded with casus belli and war goal `rebellion`.
- **Outcome text.** When a rebel war ends, the rebel realm's territory changes carry a comment:
  - "Rebels defeated" when the crown takes the rebel capital (restoration);
  - "Rebels won independence" when the rebels survive, or "Rebels won independence (n provinces reconquered)" when the crown keeps land it occupied;
  - "Rebellion lapsed" otherwise.

  The war page shows its own text: "X restored control over Y" for a restoration, "Y won independence from X" (with "after ceding n provinces" when land changed hands) for independence, and "The war lapsed: X no longer rules a realm" for a lapsed war.

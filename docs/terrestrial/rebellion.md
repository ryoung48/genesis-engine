# Rebellion (`:history`)

Code: triggers and breakaway in `src/model/history/sim/engine/events/war` (`rebel`, `seedRebellions`) and `engine/events/succession` (`pretenderRevolt`, `weakCrownRevolt`, `restoration/`); rebellion threat in `engine/military` (`rebellionThreat`); release in `engine/state/index.ts` (`releaseProvince`, `releaseFaction`, `fixConnections`); war endings in `engine/events/peace`; record text in `src/model/history/sim/record/translator`.

A rebellion is a district leaving its realm. The district and everything under it become a sovereign realm at once. An independence rebellion defends its freedom from the crown; a throne rebellion attacks to replace the crown's ruler, with all districts that backed the claimant joining its realm.

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
| Seeded | At simulation start, for up to 1.25% of districts. The realm must not be at war. | Threat > 0.55. An independence war starts already under way. |
| District's own war event | Every 8–16 years. The realm must not be at war. | Threat test, laxity 0.1 under a weak crown. An adult holder with enough backing may seek the throne; otherwise the district seeks independence. |
| Weak crown | After every succession with no pretender, and after a lord protector usurps. Districts are tried in random order, and at most one breaks away. | Threat test, laxity 0.05 per missing claim point below 3, plus 0.1 under a weak crown. An adult holder with enough backing may seek the throne. |
| Pretender | A disputed succession, a lost election or a restoration attempt ([people](people.md#succession), [restoration](people.md#restoration)). | District backing (below). No threat test. The seat must still be a direct district of the realm. A throne war always starts. |

**Threat test.** The district breaks away when `threat > 0.55 − laxity`, and then only with chance equal to the threat.

A **weak crown** is a realm under a regent, or whose ruler is in Poor or Grave health ([people](people.md#regencies)).

## Support

District holders can favor a claimant, while foreign realms can fight beside the rebels.

- **District backing.** The realm's district holders vote between the incumbent (or heir) and the claimant. Each vote is weighted by the district's population. Each holder backs:
  - a candidate of their own house; otherwise
  - one tied to their house by marriage; otherwise
  - the stronger candidate. Strength is the candidate's district's share of the vote weight, plus 0.2 if they are aged 25–60. The incumbent counts no district weight.

  With at least 40% backing, a pretender revolts with chance equal to that share. The claimant's own district, or failing that, their largest backer's, leads the rebellion. Every district that voted for the claimant joins that rebel realm with its land and share of the crown's manpower and treasury. A losing election candidate needs a district of their own and 40% of the vote. For a threat-based rebellion, an adult holder with at least 95% backing seeks the throne with 5% chance; the holder's district leads and their district backers join them.
- **Sibling districts in the threat.** The crown's other districts add 25% of their levy to the rebels' side of the threat formula. This estimate applies before a vote or breakaway; in a throne war, districts that actually back the claimant join the rebellion.
- **Foreign backers.** At the start of either rebel war, sovereign enemies of the crown or its direct diplomatic overlord may join the rebels. Rival dispositions and active wars make enemies. A disloyal overlord may back a throne claimant against its vassal, and a Rival vassal may back rebels against its overlord. A candidate needs a nonnegative treasury, must not be exhausted, in truce with the realm it opposes, at war with the rebels, or protected by a formal tie to the crown (apart from those two disloyal subject cases). Candidates roll in random order: the first has a 50% chance, and every successful backer halves the chance for the next. Backers join the rebel coalition through mobilization and battles, subject to exhaustion and debt checks. If the rebels remain sovereign, backers are repaid largest first: a realm under half the backer's revenue may become its vassal; otherwise they form an alliance when allowed, or become Trusted. A successful throne claimant owes this debt as the crown's new ruler. Crushed rebels owe nothing.

## Breakaway

- **Resources.** The rebel realm takes the crown's manpower and positive treasury in proportion to its population, including every supporting district in a throne war.
- **Ruler.** The district's holder rules the rebel realm with claim 3 (founder). With no living holder, a new house is founded. In a pretender revolt, the pretender takes the rebel throne with claim 3, even when the district belonged to a backer.
- **Cut-off land.** Crown provinces left without a connection to their parent are released as well. They are recorded as `province released` and shown as a "disconnected" revolt.

## The rebel war

- **Whether it starts.** An independence war after a threat-based breakaway starts with chance `1 − threat`; otherwise the district goes free with a 10-year truce with its former crown. A throne war always starts, as does a seeded rebel war.
- **Sides.** The crown attacks in an independence war. The rebels attack in a throne war and can occupy the crown's capital. Only the war's attacker occupies land (see [military](military.md#battle-resolution)).
- **Protection.** A realm will not declare a separate war on the rebel side while its rebel war is active.
- **No buy-off.** Rebels cannot buy peace.

## Endings

Every ending sets a 10-year truce and leaves the two leaders Suspicious.

### Independence wars

| How it ends | Outcome |
| --- | --- |
| The crown takes the rebel capital | **Restoration**: the rebel realm returns in full. |
| The war stalls or runs out while the crown holds rebel land | **Independence**: the crown keeps what it occupies (a partial reconquest), and the rest of the rebels stay independent. |
| Anything else (crown driven back, both exhausted, no troops, no target) | **Independence**: a rebel war never ends in white peace. |
| The crown stops being sovereign while the rebels remain | **Independence**. |
| Otherwise, a leader stops being sovereign | **Lapsed**. |

### Throne wars

| How it ends | Outcome |
| --- | --- |
| Rebels take the crown's capital | **Regime change**: the claimant takes the throne, the rebel realm rejoins the crown, and the overthrown ruler becomes the deposed claimant. If the crown is vacant, its ruler at the war's start receives that claim. |
| The war stalls while rebels occupy crown land | **Cession**: rebels keep the occupied land and remain sovereign. |
| Rebels hold no occupied land when the war ends | **Submission**: the rebel realm rejoins the crown and the claimant loses the rebel seat. |
| The crown ceases to be sovereign while rebels remain | **Independence**. |
| Otherwise, a leader ceases to be sovereign | **Lapsed**. |

## Rebellions inside a diplomatic vassal

A crown's direct overlord normally joins its side through the formal vassal tie. If that overlord fought for the crown and loses a throne war, the new regime renounces the bond and the pair becomes Suspicious. If the overlord stayed out, the bond survives and the pair becomes Suspicious. If a disloyal overlord backed the claimant, the bond survives and repayment makes the pair Trusted. Each rule uses only the crown's direct overlord; an overlord further up a vassal chain does not join through that chain.

## Diplomatic dispositions

Every pair of realms has a shared attitude: Rival, Suspicious, Neutral, Friendly or Trusted. Formal alliances, vassalage, unions, colonies and wars are separate ties. Neighboring pairs start with one weighted attitude draw; an old Ally draw makes the pair Trusted and creates an alliance if allowed. Other pairs start Neutral.

On each realm's diplomacy event, neighboring pairs and its direct formal-tie partners roll through the five-state transition matrix. An active war does not drift. A marriage-bound alliance cannot drift downward. Only a free neighboring pair already Trusted at the start of the event rolls a 3% chance to form a pact. A smaller realm can become a vassal when its revenue is under half the other's; otherwise an allowed pact is an alliance. An unbound alliance dissolves with chance 0% at Trusted, 10% at Friendly, 35% at Neutral, 70% at Suspicious and 100% at Rival.

| Vassal–overlord disposition | Vassal breaks free when threat exceeds |
| --- | ---: |
| Trusted | 0.995 |
| Friendly | 0.97 |
| Neutral | 0.7 |
| Suspicious | 0.4 |
| Rival | 0.05 |

A Rival vassal refuses its overlord's war call and withholds tribute. A Suspicious vassal refuses an offensive call. An overlord that fights beside its vassal in the vassal's war raises the pair's disposition one step at peace; one that sits out lowers it one step. A Rival or Suspicious ally refuses a defensive call until its alliance dissolves.

## Record

- **Revolt text.** Each revolt adds "Revolted against X (cause, for pretender)" to the rebel nation; a throne revolt adds "to seize the throne". The cause is `threat`, `succession`, `restoration` or `disconnected`.
- **War name.** An independence war is "Suppression of the X Revolt", or "X Civil War" when the rebel territory exceeds half the crown's area. A throne war is "X War of Succession", with casus belli `claim` and war goal `throne`.
- **Outcome text.** When a rebel war ends, the rebel realm's territory changes carry a comment:
  - "Rebels defeated" when the crown takes the rebel capital (restoration);
  - "Rebels held out" when the rebels survive, or "Partial reconquest (n provinces)" when the crown keeps land it occupied;
  - "Rebellion lapsed" otherwise.

  Throne outcomes add "Claimant took the throne", "Rebels submitted", or "Rebels held land (n provinces)". Coalition backers appear with the `backer` role. The record no longer tracks rivalries.

  The war page shows its own text: "X restored control over Y" for a restoration, "Y won independence from X" (with "after ceding n provinces" when land changed hands) for independence, and "The war lapsed: X no longer rules a realm" for a lapsed war.

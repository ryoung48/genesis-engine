# Rebellions, independence and throne wars

Scope: `:history`.

District rebellions create independent realms or contest a throne. [Armies and wars](armies-and-wars.md) owns combat and occupation; [diplomacy](diplomacy-and-subjects.md) owns attitudes and formal subject obligations.

Code: triggers and breakaway in `src/model/history/sim/engine/events/war` (`rebel`, `seedRebellions`) and `engine/events/succession` (`pretenderRevolt`, `weakCrownRevolt`, `restoration/`); rebellion threat in `engine/military` (`rebellionThreat`); release in `engine/state/index.ts` (`releaseProvince`, `releaseFaction`, `fixConnections`); war endings in `engine/events/peace`; record text in `src/model/history/sim/record/translator`.

A rebellion is a district leaving its realm. The district and everything under it become a sovereign realm at once. An independence rebellion defends its freedom from the crown; a throne rebellion attacks to replace the crown's ruler, with all districts that backed the claimant joining its realm.

## Who can rebel

A **district** is a flagged seat exactly one tier below its realm’s top tier, outside crown land, answering directly to its sovereign. A living county admin can rebel. Crown land and vacant seats never rebel.

## Rebellion threat

The threat compares independently calculated rebel and remaining-crown recruitment targets. Each prospective territory uses its own population, knowledge, tax extraction, state maintenance, affordability, and field logistics (diminishing returns beyond the knee). The crown's territory excludes the departing district, whose territory includes all land attached by adjacency. It uses the cubed force share from [military](armies-and-wars.md#war-starts).

```text
crownTarget = recruitment targets for the remaining crown territory
rebelTarget = recruitment targets for the departing district
league      = sum of independent recruitment targets for other eligible districts

crown  = (0.75 * crownTarget.levy + crownTarget.regular) / (1 + existing crown wars)
estimate = 0.9 * (rebelTarget + 0.25 * league), computed per troop type
scale = (max(rebel knee, rebelTarget total) / total estimated soldiers)^0.5, at most 1
rebels = scale * (0.75 * estimate.levy + estimate.regular)
threat = rebels^3 / (crown^3 + rebels^3)
```

Other districts count at 25% because they may join; actual supporters are selected after the threat test. The preview is read-only. Actual release recalculates each army to full independent targets after territorial reassignment, including any supporters that actually join. Neither levies nor regulars transfer from the parent. Existing accrued expenses settle first; army increases and reductions are recorded as recruitment and demobilization. The release explicitly resets earlier depletion, while ordinary recruitment afterward retains the wartime levy restriction. The rule is shared across governments.

Strength-tested candidates emit a `rebellion evaluated` diagnostic note before any release. It records both independent requests/targets, actual limiting constraints, crown enrollment, potential support, existing wars, final estimated strengths, threat, threshold/laxity, seeded/succession context, and acceptance or threshold/random rejection. A roll of `-1` means the existing short-circuit decision consumed no random draw. These notes do not change recruitment or decision rules. Pretender revolts that bypass the strength test are not strength-tested candidates.

## Triggers

| Trigger | When | Test |
| --- | --- | --- |
| Seeded | At simulation start, for up to 1.25% of districts. The realm must not be at war. | Threat > 0.45. An independence war starts already under way. |
| District's own war event | Every 8–16 years. The realm must not be at war. | Threat test, laxity 0.1 under a weak crown. An adult holder with enough backing may seek the throne; otherwise the district seeks independence. |
| Weak crown | After every succession with no pretender, and after a lord protector usurps. Skipped at a succession that [partitions](government-and-succession.md#partition) the realm. Districts are tried in random order, and at most one breaks away. | Threat test, laxity 0.05 per missing claim point below 3, plus 0.1 under a weak crown. An adult holder with enough backing may seek the throne. |
| Pretender | A disputed succession, a lost election or a restoration attempt ([government](government-and-succession.md#succession), [restoration](government-and-succession.md#restoration)). Skipped at a succession that partitions the realm; a deposed claim is kept for later. | District backing (below). No threat test. The seat must still be a direct district of the realm. A throne war always starts. |

**Threat test.** The district breaks away when `threat > 0.45 − laxity`, and then only with chance equal to the threat.

A **weak crown** is a realm under a regent (for a child or for an incapable ruler), or whose ruler has effective health below 2.5 ([simulated people](government-and-succession.md#regencies), [health](../people/health-and-mortality.md#other-uses-of-health)).

## Support

District holders can favor a claimant, while foreign realms can fight beside the rebels.

- **District backing.** The realm's district holders vote between the incumbent (or heir) and the claimant. Each vote is weighted by the district's population. Each holder backs:
  - a candidate of their own house; otherwise
  - one tied to their house by marriage; otherwise
  - the stronger candidate. Strength is the candidate's district's share of the vote weight, plus 0.2 if they are aged 25–60. The incumbent counts no district weight.

  With at least 40% backing, a pretender revolts with chance equal to that share. The claimant's own district, or failing that, their largest backer's, leads the rebellion. Every district that voted for the claimant joins that rebel realm with its land and share of the crown's enrolled troops and treasury. A losing election candidate needs a district of their own and 40% of the vote. For a threat-based rebellion, an adult holder with at least 95% backing seeks the throne with 5% chance; the holder's district leads and their district backers join them.
- **Sibling districts in the threat.** The crown's other districts add 25% of their levy to the rebels' side of the threat formula. This estimate applies before a vote or breakaway; in a throne war, districts that actually back the claimant join the rebellion.
- **Foreign backers.** At the start of either rebel war, sovereign enemies of the crown or its direct diplomatic overlord may join the rebels. Rival dispositions and active wars make enemies. A disloyal overlord may back a throne claimant against its vassal, and a Rival vassal may back rebels against its overlord. A candidate needs a nonnegative treasury, must not be exhausted, in truce with the realm it opposes, at war with the rebels, or protected by a formal tie to the crown (apart from those two disloyal subject cases). Candidates roll in random order: the first has a 50% chance, and every successful backer halves the chance for the next. Backers join the rebel coalition through mobilization and battles, subject to exhaustion and debt checks. If the rebels remain sovereign, backers are repaid largest first: a realm under half the backer's revenue may become its vassal; otherwise they form an alliance when allowed, or become Trusted. A successful throne claimant owes this debt as the crown's new ruler. Crushed rebels owe nothing.

## Breakaway

- **Resources.** The rebel realm takes the crown's enrolled troops and positive treasury in proportion to its population, including every supporting district in a throne war.
- **Ruler.** The district's holder rules the rebel realm with claim 3 (founder). With no living holder, or when the holder rules the realm being left or another crown that cannot unite with the new realm, a new house is founded. In a pretender revolt, the pretender takes the rebel throne with claim 3, even when the district belonged to a backer.
- **Cut-off land.** When a district leaves for independence, any of its own land left without a connection to its seat is released as well, recorded as `province released` and shown as a "disconnected" revolt. A throne rebellion releases nothing at the declaration: crown districts the faction has severed stay with the crown through the war, and are settled at the peace if both realms are still standing.
- **Partition.** A [partition](government-and-succession.md#partition) releases a district through the same path, with three differences: no war starts and relations are neutral, the new realm takes the divided realm's government instead of the one its seat province carried, and cut-off land first joins a bordering heir realm of equal or higher top tier.

## The rebel war

- **Whether it starts.** An independence war after a threat-based breakaway starts with chance `1 − threat`; otherwise the district goes free with a 10-year truce with its former crown. A throne war always starts, as does a seeded rebel war.
- **Sides.** The crown attacks in an independence war. The rebels attack in a throne war and can occupy the crown's capital. Only the war's attacker occupies land (see [military](armies-and-wars.md#battle-resolution)).
- **Protection.** A realm will not declare a separate war on the rebel side while its rebel war is active.
- **No buy-off.** Rebels cannot buy peace.

## Endings

Every ending sets a 10-year truce and leaves the two leaders Suspicious. Rebel wars use the same [war score](armies-and-wars.md#war-score) and the same ending order as conquest wars: a total result needs the score at +100 or the capital held when the war ends, and occupied land is kept only on a positive score. A [negotiated peace](armies-and-wars.md#endings) can end either rebel war with the attacker keeping what it holds and no payment.

### Independence wars

| How it ends | Outcome |
| --- | --- |
| The score reaches +100, or the war ends for any reason while the crown holds the rebel capital | **Restoration**: the rebel realm returns in full. |
| The war ends otherwise while the crown holds rebel land on a positive score | **Independence**: the crown keeps what it occupies (a partial reconquest), along with any rebel district that this cuts off and that borders the crown, and the rest of the rebels stay independent. |
| Anything else (crown driven back, both exhausted, no troops, no target) | **Independence**: a rebel war never ends in white peace. |
| The crown stops being sovereign while the rebels remain | **Independence**. |
| Otherwise, a leader stops being sovereign | **Lapsed**. |

### Throne wars

A winning rebel claimant holds no other crown: while a throne war runs, neither side's realm passes by inheritance to someone who rules another sovereign realm.

| How it ends | Outcome |
| --- | --- |
| The score reaches +100, or the war ends for any reason while the rebels hold the crown's capital | **Regime change**: the claimant takes the throne, the rebel realm rejoins the crown, and the overthrown ruler becomes the deposed claimant. If the crown is vacant, its ruler at the war's start receives that claim. |
| The war ends otherwise while the rebels hold crown land on a positive score | **Cession**: rebels keep the occupied land, along with any crown district that this cuts off and that borders them, and remain sovereign. |
| The rebels hold no land, or hold it on a score of zero or less, when the war ends | **Submission**: the rebel realm rejoins the crown and the claimant loses the rebel seat. |
| The crown ceases to be sovereign while rebels remain | **Independence**. |
| Otherwise, a leader ceases to be sovereign | **Lapsed**. |

## Rebellions inside a diplomatic vassal

A crown's direct overlord normally joins its side through the formal vassal tie. If that overlord fought for the crown and loses a throne war, the new regime renounces the bond and the pair becomes Suspicious. If the overlord stayed out, the bond survives and the pair becomes Suspicious. If a disloyal overlord backed the claimant, the bond survives and repayment makes the pair Trusted. Each rule uses only the crown's direct overlord; an overlord further up a vassal chain does not join through that chain.

## Subject secession thresholds

The [diplomatic attitude](diplomacy-and-subjects.md) of a vassal toward its overlord determines the threat needed to break free.

| Vassal–overlord disposition | Vassal breaks free when threat exceeds |
| --- | ---: |
| Trusted | 0.995 |
| Friendly | 0.97 |
| Neutral | 0.7 |
| Suspicious | 0.4 |
| Rival | 0.05 |

## Record

- **Revolt text.** Each revolt adds "Revolted against X (cause, for pretender)" to the rebel nation; a throne revolt adds "to seize the throne". The cause is `threat`, `succession`, `restoration` or `disconnected`.
- **Split text.** A realm created by a partition reads "Split from X in the partition of [late ruler]'s realm, under [heir]" instead.
- **War name.** An independence war is "Suppression of the X Revolt", or "X Civil War" when the rebel territory exceeds half the crown's area. A throne war is "X War of Succession", with casus belli `claim` and war goal `throne`. A [foreign claim](personal-unions.md#foreign-claims) war shares the name, casus belli and goal but is not a rebel war.
- **Outcome text.** When a rebel war ends, the rebel realm's territory changes carry a comment:
  - "Rebels defeated" when the crown takes the rebel capital (restoration);
  - "Rebels held out" when the rebels survive, or "Partial reconquest (n provinces)" when the crown keeps land it occupied;
  - "Rebellion lapsed" otherwise.

  Throne outcomes add "Claimant took the throne", "Rebels submitted", or "Rebels held land (n provinces)". Coalition backers appear with the `backer` role. The record no longer tracks rivalries.

  The war page shows its own text: "X restored control over Y" for a restoration, "Y won independence from X" (with "after ceding n provinces" when land changed hands) for independence, and "The war lapsed: X no longer rules a realm" for a lapsed war.

## Attribute and trait effects

Governor diplomacy adds `clamp(-0.0125 × (diplomacy - 5.5), -0.1, 0.1)` to laxity on every strength-tested rebellion. An Ambitious district holder adds 0.02; Content subtracts 0.02. The holder's opinion of the ruler adds `−0.002 × o`, at most ±0.2, where `o` leaves the religion term out: a holder at +50 offsets one weak crown and one at −50 adds one ([district loyalty](../people/opinion-and-relationships.md#district-loyalty-and-noble-popularity)). A [composite realm](title-hierarchy.md#founding-and-dissolving-founding-coronationelevate), one that holds the lands of a rank above its own without the title, adds 0.05 (`COMPOSITE_REALM_LAXITY`) to every strength-tested check of its districts, including the weak-crown test at an accession. The value equals one weak-claim step: to the nobles of the second kingdom, a king over two kingdoms is a ruler whose right over them is one step short. Composite monarchies without a unifying title kept separate estates and were prone to separating (the Crown of Aragon's kingdoms; the Habsburg lands until the Austrian imperial title of 1804), which supports the direction of the effect, not its size. The flag is rewritten once a year by the elevation pass, so land gained or lost mid-year changes it at the next pass, and no realm is flagged before the first pass of a run. All these terms and the weak-crown and weak-claim laxity are summed; none replaces another, so a child ruling a composite realm carries 0.15. The `rebellion evaluated` note records the holder's opinion and whether the realm was composite beside the laxity. A realm's [noble popularity](../people/opinion-and-relationships.md#district-loyalty-and-noble-popularity) summarizes those opinions and decides nothing itself; realm attitudes are in [diplomacy](diplomacy-and-subjects.md#personal-bias). Regency and health below 2.5 make the crown weak. See [attributes and traits](../people/attributes-and-traits.md) for the full rules.

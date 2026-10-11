# Personal unions

A personal union ties the realms of one ruler who governs several single-heir realms. Union links are formal ties: they stop the two realms attacking each other and make them fight together. The ruler record, shared columns and event ownership are in [rulers and dynasties](rulers-and-dynasties.md#shared-rulers-and-unions).

## Formation and blocks

- **Formed** when a daughter's line inherits through a [royal marriage](royal-marriages.md#in-succession) and the partner's own ruler takes the throne (chance 0.20), or when a foreign claim is won (see below).
- **Single-heir only.** `STATE.canUnite` is the one test every new link passes. It requires both realms to be single-heir. A union by inheritance also requires that neither realm is pressing a war for a throne.
- **Senior** is the realm that must lead (it already has juniors or an overlord), else the one with more provinces. The whole resulting group, including existing juniors, takes the incoming living ruler.
- **Blocked** for a new external link when realms are at war, either is not single-heir, either is already a union junior, or both must lead. A [government change](government-change.md) away from single-heir succession ends the realm's union links.
- **Union by inheritance rate.** `UNION_INHERIT_CHANCE = 0.20`: 6.1 union juniors stood on average on the person model (5,740 junior-years); about 350 daughter-line successions with a tie occur per run (4,097 inheritances × 0.19 × 0.45, the share of realms holding a tie at a succession); a union ends at the third same-house succession (merge) or the first other outcome, so with 0.80 for the same house it lasts 1 + 0.8 + 0.64 = 2.44 senior successions, about 73 years at a 30-year reign; `6.1 × 933 / 73 ≈ 78` unions, less 8 from claim wars, over 350 gives 0.20. An estimate, checked by the report's `unions` fields.

## Continuing and ending

- **Continued.** At a senior's succession to an heir of the same house every junior takes the new ruler and counts one more shared reign.
- **Merged** into the senior when an adjacent junior has had 3 shared rulers (`UNION_MERGE_GENERATIONS`).
- **Ended** at any other succession outcome: each junior is seated with a ruler of the old dynasty, claim 2, and `personal union ended` is logged. A government that leaves single-heir succession ends the realm's links the same way.
- **Replacement.** A usurpation or overthrow of the senior keeps the group only for a ruler of the same house, without counting a reign; a replaced junior leaves the union alone.
- **Lost seniors.** Juniors whose senior stops being sovereign and that still share one ruler stay together: the largest becomes their senior, generation counts are kept and a `personal union continued` note is logged; a lone junior keeps its ruler on its own throne.

## No untied double rule

At every year boundary the sovereign realms one ruler governs share one union group. The report validates this each year (`ruler of realms outside one union group`). While a throne or claim war runs, a realm cannot be given another realm's ruler through inheritance, and the attacker's own ruler cannot be inherited elsewhere.

## Foreign claims

When the heir of a single-heir realm is a minor and the realm has a royal marriage tie, a random saved tied partner is the claimant. After the succession's revolts, if the claimant's realm is still sovereign with the same ruler, neither realm is pressing a war for a throne and the pair could still unite, the claimant's realm may declare a `claim` war on the realm. The gate is the ordinary conquest declaration applied to that one neighbour: independent realm with a strong crown, no truce, no formal tie, no war with it, threat under the disposition threshold, and the war roll `(1 − threat) / 1.11`. No new willingness constant exists, and no buy-off or submission offer is made.

A claim war is an interstate war fought, scored and targeted like a conquest war, with no rebels or backers. It records the ruler ids of the attacker and defender at the start.

- **The claim stands** while the attacker's ruler and the defender's ruler are both unchanged, the attacker is sovereign and the pair could still unite (the pair's own war disregarded).
- **Lapse.** When the claim stops standing, `CONQUEST.settle` ends the war with reason `claim lapsed`: a lapsed outcome with the defender as winner, nothing moves, and the usual truce follows.
- **Union.** When the score reaches +100, or the war ends for any reason while the attacker holds the defender's capital, and the claim stands, the attacker's ruler takes the defender's throne and the two realms form a union. No land moves, occupations are cleared, and no truce or Suspicious disposition follows because a union already excludes attack.
- **Otherwise** the war ends as any conquest war without land: an indemnity roll for `defended`, `offensive spent` and `offensive repelled`, else white peace. Occupied land is handed back at every ending.

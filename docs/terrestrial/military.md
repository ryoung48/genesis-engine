# Armies and battles (`:history`)

Code: army economy and combat in `src/model/history/sim/engine/military`; army and manpower limits in `engine/economy` and `engine/knowledge`; war creation and settlement in `engine/state/index.ts`; war decisions in `engine/events/war`; scheduled battles in `engine/events/battle`.

Armies are abstract strength values. The simulation tracks manpower, field logistics, treasury support, war deployments, casualties, and occupied provinces; it does not track individual soldiers, units, or commanders.

## Manpower and army traditions

| Tradition | Government | Levy rate | Revenue collection | Exhaustion threshold |
| --- | --- | ---: | ---: | ---: |
| Paid | Other governments | 2% | 100% | 25% of max manpower |
| Tribal | Tribal family | 5% | 1/3 | 80% |
| Steppe | Steppe horde | 12% | 1/3 | 80% |

```text
maximum manpower = realm population × levy rate
annual recovery = (maximum manpower − current manpower) × 0.10 × elapsed years
```

Manpower starts at its maximum. Tax events restore 10% of the remaining gap per year; battle and raid casualties reduce it immediately.

## Field army, logistics, and cost

Realm knowledge sets the maximum field army and paid-army campaign pay:

| Realm knowledge | Field army cap | Campaign pay multiplier |
| ---: | ---: | ---: |
| 0 | 25,000 | — |
| 1 | 40,000 | 0.33 |
| 2 | 80,000 | 0.65 |
| 3 | 200,000 | 1.00 |
| 4 | 1,500,000 | — |

Values between listed knowledge levels are interpolated. Paid campaign pay has a base of 1,000 grams silver equivalent per soldier (0.02 ducats at 50,000 grams per ducat).

```text
paid fielded = min(logistics cap, manpower, affordable soldiers)
affordable soldiers = max(0, treasury + 2 × annual discretionary revenue) / campaign pay

tribal/steppe fielded = min(logistics cap, manpower × muster fraction)
muster fraction = 0.10 + 0.20 × treasury fill
```

| Tradition | Peace upkeep per year | Wartime upkeep per year |
| --- | --- | --- |
| Paid | 5 g silver × maximum manpower | Campaign pay × fielded force |
| Tribal / steppe | 0 | 100 g silver × fielded force |

Upkeep is converted to ducats at 50,000 grams per ducat and charged at tax events. Paid realms can borrow; other traditions' treasury floors at zero. Treasury reserves are capped at two years of discretionary revenue.

## Deployment and coalition strength

```text
per-war force = fielded force / (1 + number of active wars)
ally contribution ceiling = 0.5 × ally force
```

Deployments are distributed over every active war a realm joins. The initial distribution weights each war by its opponent's field strength, multiplying that weight by 0.5 for wars joined as an ally. A total of 20% is split evenly across assignments; the remaining 80% is divided by weight. If capacity rises, deployments recover 25% of the remaining gap per year. Losses reduce both manpower and that war's deployment.

Each coalition's total deployment is capped by the lead belligerent's logistics cap. When it exceeds the cap, all member deployments are scaled by the same ratio.

## War starts

| Trigger | Rule |
| --- | --- |
| Initial interstate wars | Seeded among neighboring sovereigns; some start with occupied provinces and reduced manpower. |
| Initial rebellions | Seeded among eligible great districts whose threat against the sovereign exceeds 0.55. |
| Later interstate war | Periodic decision, usually every 5–10 years; independent, strong-crown realm picks its nearest viable neighbor if threat is below its relation threshold. |
| Later rebellion | Eligible district may break away if threat exceeds 0.55 (reduced when the crown is weak); its sovereign must not already be at war. |

Interstate attacks do not target allies, subjects, or union partners. Threat is calculated by squared force share:

```text
threat = defender force² / (attacker force² + defender force²)
```

| Relation | Attack threshold |
| --- | ---: |
| Rival | 0.8 |
| Suspicious | 0.6 |
| Neutral | 0.45 |
| Friendly | 0.1 |

Other relations have threshold 0 and are excluded by the eligibility rules. Rebellion threat compares the overlord's remaining force with the subject's estimated manpower share plus 25% of eligible sibling vassals' shares, scaled by a levy and treasury-dependent loyalty factor. It uses the same squared force share formula.

## Battle resolution

| Timing or target | Rule |
| --- | --- |
| First battle | 1–6 months after war creation. |
| Later battle | 4–24 months after the previous battle; winner becomes next event's attacker. |
| Invasion target | Unoccupied defender province adjacent to attacker territory or that war's occupation. |
| Rebellion restoration target | Most recently occupied province. |
| No legal target | War ends in stalemate. |

```text
effective attack  = max(1, attacking coalition deployment)
effective defense = max(1, defending coalition deployment × 1.2)

attacker win chance = effective attack²
                    / (effective attack² + effective defense²)
```

The event's attacker and defender can change between battles; this formula uses those battle roles. The 1.2 factor is the model's only explicit battle terrain/defense modifier.

| Quantity | Formula |
| --- | --- |
| Loser base loss share | `0.10 × winner force / loser force` |
| Winner base loss share | `0.10 × loser force / winner force` |
| Random variation | Multiply each share by a uniform value from 0.7 to 1.3 |
| Outcome modifier | Loser × 1.5; winner × 0.75 |
| Final share | Clamp to 0–0.60 |
| Member casualties | Coalition losses × member deployment / coalition deployment |

Battle casualties reduce manpower and reduce each realm's rural population proportionally. The battle record stores winner, odds, army and deployment values, losses, victory degree, target province, and plunder. Victory degree is decisive when the loser's loss share is over 3× the winner's, victory over 1.5×, and pyrrhic otherwise.

## Occupation and war settlement

| End condition | Result |
| --- | --- |
| Attacker wins at defender capital | Attacker victory; defender territory transfers to attacker. |
| Both sides exhausted | Stalemate; occupied defender territory transfers. |
| Attacker exhausted before taking territory | War ends without conquest. |
| No legal target or either belligerent loses sovereignty | Stalemate. |
| Rebellion restoration wins and clears final occupied province | Rebellion war ends. |

Occupied provinces belong to one war and are cleared when it ends. A fully conquered defender releases its subject relations; transferred provinces are repartitioned under the attacker. A stalemate transfers only provinces occupied by that war. The war record logs the winner, transferred provinces, and stalemate reason.

## Plunder and raids

| Action | Rule |
| --- | --- |
| Province plunder | 3% of annual province output; same province has a 5-year cooldown. |
| Capital sack | Also takes 20% of the loser's positive treasury. |
| Loot credited | Paid realm receives 1/3; tribal/steppe receives all, capped by reserve capacity. |
| Raid party | 25% of raider's fielded strength. |
| Raid response | 15% of victim's per-war force, with the 1.2 defense multiplier. |

Raids use the same odds and casualty framework. Successful raids plunder province output but do not sack the victim's treasury.

## Scope

These rules describe the procedural `:history` simulation. Imported historical wars are translated into history records and do not run through this live army and battle engine.

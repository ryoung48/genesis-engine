# Armies and battles (`:history`)

Code: army economy and combat in `src/model/history/sim/engine/military`; army and manpower limits in `engine/economy` and `engine/knowledge`; war creation and settlement in `engine/state/index.ts`; war decisions in `engine/events/war` (peaceful annexation in `war/submission`); scheduled battles in `engine/events/battle`.

Armies are abstract strength values. The simulation tracks manpower, field logistics, treasury support, war deployments, casualties, and occupied provinces; it does not track individual soldiers, units, or commanders.

## Manpower and army traditions

| Tradition | Government | Levy rate | Revenue collection | Exhaustion threshold |
| --- | --- | ---: | ---: | ---: |
| Settled | Other governments | 2% | 100% | 25% of max manpower |
| Tribal | Tribal family | 5% | 1/3 | 80% |
| Steppe | Steppe horde | 12% | 1/3 | 80% |

```text
maximum manpower = realm population × levy rate
annual recovery = (maximum manpower − current manpower) × 0.10 × elapsed years
```

Manpower starts at its maximum. Tax events restore 10% of the remaining gap per year; battle and raid casualties reduce it immediately.

## State maintenance and treasury

Each sovereign's collected revenue `R` is the sum of its provinces' output × realm extraction rate × collection share. Every province costs 35% of its own revenue to administer, scaled by great-circle distance from the sovereign root province (its capital):

```text
travel days = distance km / 30
distance multiplier = 1 + 0.15 × (travel days / 30)^0.7
state maintenance = Σ province revenue × 0.35 × distance multiplier
civilian surplus D = R − state maintenance
```

At 0, 30, 60, 120, 240, and 365 days the multiplier is 1.00, 1.15, 1.24, 1.40, 1.64, and 1.86. All traditions pay state maintenance.

There is no treasury cap. The safe treasury `T_safe = 2 × max(0, D)` is a reference level: after the year's revenue, maintenance, and army payment, a positive treasury above it leaks.

```text
annual leakage = T_safe × 0.04 × max(0, treasury / T_safe − 1)²
```

Leakage never exceeds the positive treasury; with `T_safe = 0` the whole positive treasury leaks. Treasury fill (`treasury / T_safe`, clamped to 0–1) drives tribal and steppe muster, raid chance, and overlord loyalty. New realms start with one year of `max(0, D)`.

## Field army, logistics, and cost

Realm knowledge sets the maximum field army:

| Realm knowledge | Field army cap |
| ---: | ---: |
| 0 | 25,000 |
| 1 | 40,000 |
| 2 | 120,000 |
| 3 | 400,000 |
| 4 | 1,500,000 |

Values between listed knowledge levels are interpolated. Soldier prices scale with the realm's output per resident `Y` (grams of silver before extraction):

```text
peace cost per man-year = 0.40 kg × tradition cost share × (Y / 450)^0.5
war cost per man-year   = 1.25 kg × tradition cost share × (Y / 450)^0.5
```

| Tradition | Cost share |
| --- | ---: |
| Settled | 0.5 |
| Tribal / steppe | 0.05 |

Every tradition pays its army; tribal and steppe warriors cost less because they bring lighter kit and serve for spoils more than continuous pay. The settled cost share was calibrated at half the originally proposed price: at full price, early settled armies fell to about half their earlier size. Every tradition sizes its army from a peacetime budget of 75% of the civilian surplus, priced at the peace rate:

```text
army size = min(logistics cap, manpower, 0.75 × max(0, D) / peace cost)
tribal/steppe army size = min(that, manpower × (0.10 + 0.20 × treasury fill))
```

Armies are charged at each tax settlement: the war rate on the whole field army while the realm fights in any war, as a lead, ally, or vassal, and the peace rate otherwise. Settled realms can borrow; tribal and steppe realms pay maintenance and then warriors only from cash in hand, so their treasury floors at zero. Settled realms are fiscally exhausted below `−0.5 × max(0, D)`.

## Deployment and coalition strength

```text
per-war force = fielded force / (1 + number of active wars)
```

A war's two leads fight with their coalitions. A lead's vassals, overlord, and union partners join on either side; its allies join only when it defends. Nobody joins against its own ally or the realm that rules it, uninhabited provinces never join, and an exhausted realm makes a separate peace and leaves. Allies already fighting stay until exhausted, but a realm joining or rejoining a war must be unexhausted and out of debt.

Armies mobilize when a war is declared: every coalition member deploys immediately, and the war record keeps each realm's declared strength and its relation to its side's lead. Every member commits its whole field army, split over every active war it fights in and rebalanced before each battle. The distribution weights each war by its opponent's field strength: a total of 20% is split evenly across assignments, and the remaining 80% is divided by weight. If capacity rises, deployments recover 75% of the remaining gap per year. Losses reduce both manpower and that war's deployment.

Each coalition's total deployment is capped by the lead belligerent's logistics cap. When it exceeds the cap, all member deployments are scaled by the same ratio.

## War starts

| Trigger | Rule |
| --- | --- |
| Initial interstate wars | Seeded among neighboring sovereigns; some start with occupied provinces and reduced manpower. |
| Later interstate war | Periodic decision, usually every 5–10 years; independent, strong-crown realm picks its nearest viable neighbor (by distance from its capital to the neighbor's closest province) if threat is below its relation threshold. |
| Peaceful annexation | Before a declared war starts, a target whose threat is below 0.05 submits with 50% chance: it is annexed as if its capital had fallen, with no war. |

A peaceful annexation is not a war: it has no war record, battles or truce, and does not count in war statistics. The annexed realm's subject relations are released, its provinces are repartitioned under the annexer, and its ruler is deposed. In the record, each annexed province's ownership change carries the comment "X was peacefully annexed by Y", and both realms' timelines get an Annexation row with the same sentence.

Rebellions have their own triggers, threat and endings; see [rebellion](rebellion.md).

Interstate attacks do not target allies, subjects, or union partners. Threat is calculated by cubed force share, with no terrain or defender bonus:

```text
threat = defender force³ / (attacker force³ + defender force³)
```

| Relation | Attack threshold |
| --- | ---: |
| Rival | 0.8 |
| Suspicious | 0.6 |
| Neutral | 0.45 |
| Friendly | 0.1 |

Other relations have threshold 0 and are excluded by the eligibility rules.

## Battle resolution

| Timing or target | Rule |
| --- | --- |
| First battle | 1–4 months after war creation or, for seeded wars, after simulation start. |
| After an inconclusive battle | 3–8 months. |
| After a normal victory | 2–10 months. |
| After a decisive victory, rout, or uncontested battle | 1–4 months. |
| Next attacker | The winner with 70% probability, the loser with 30%. |
| War attacker holding nothing | Keeps attacking; after a loss it regroups for 3–8 months. |
| Invasion target | Unoccupied defender province adjacent to attacker territory or that war's occupation. |
| Rebellion restoration target | Most recently occupied province. |
| Target check | When the battle runs; if the queued attacker has no target but the other side does, they swap roles. |
| No legal target for either side | War ends in stalemate. |

The target province sets the defender's terrain bonus:

| Topography | Bonus | Vegetation | Bonus |
| --- | ---: | --- | ---: |
| Flat | 0% | Desert, sparse, grasslands | 0% |
| Hill | 10% | Woods | 5% |
| Plateau | 5% | Forest | 10% |
| Mountains | 20% | Jungle | 15% |
| Marsh | 15% | | |

Water codes at a land target count as flat grasslands. Terrain changes strength, never troop counts, and raids keep a flat 1.2 defense multiplier.

```text
S_A = attacking coalition troops
S_B = defending coalition troops × (1 + topography bonus + vegetation bonus)
pre-battle win probability = S_A³ / (S_A³ + S_B³)

X = ln(S_A / S_B) + ln(u / (1 − u)) / 3      u ~ U(0, 1)
attacker wins when X > 0
power share B = 1 / (1 + e^−X)
attacker casualties = N_A × 0.20 × (1 − B)^1.5
defender casualties = N_B × 0.20 × B^1.5
```

The margin `|X|` sets the result: below 0.20 inconclusive, below 0.90 normal, otherwise decisive. The loser then checks for a rout:

```text
R = loser casualties / loser troops + 0.15 × |X| + 0.20 × deployment shortfall
rout chance = 1 / (1 + e^(−20 × (R − 0.40)))
```

Deployment shortfall is the share of the loser's assigned troops not yet deployed. A routed loser loses a further 5–20% of its remaining troops. The rout midpoint was calibrated to 0.40 so that about a third of contested battles rout; real battles are lopsided. An inconclusive battle without a rout blocks all progress: no plunder, sack, occupation, restoration, or capital victory. If one side has no troops, the other wins uncontested with no losses; if neither does, the war ends (`no troops`).

Battle casualties reduce manpower and each realm's rural population proportionally. The battle record stores the result, pre-battle win probability, power share, terrain, knowledge-capped troops, deployments, losses, target province, and plunder.

## Occupation and war settlement

Code: war endings are checked after each battle in `engine/events/battle`; the terms are set in `engine/events/peace` (`PEACE.terms`, `PEACE.conclude`). This section covers conquest wars; rebel wars have their own endings (see [rebellion](rebellion.md#endings)).

A war ends when the first of these holds, in this order:

| Reason | When |
| --- | --- |
| `not sovereign` | Before a battle, either war leader is no longer sovereign. |
| `no target` | Neither side has a legal target. |
| `no troops` | Neither side has troops in the field. |
| `occupation restored` | The defender wins back the last occupied province. |
| `capital taken` | The attacker wins at the defender's capital. |
| `both exhausted` | Both war leaders are exhausted. |
| `offensive spent` | The attacker holds nothing and is exhausted after its own attack. |
| `offensive repelled` | The attacker holds nothing and has just lost its own attack. The defender then ends the war with 40% chance after a decisive win, 75% after a rout and 90% after an uncontested win; otherwise the attacker regroups for 3–8 months and tries again. |
| `peace bought` | Any other battle, if the defender can afford a buy-off and accepts it (50% chance). |

The reason then sets the terms:

| Terms | When | Result |
| --- | --- | --- |
| **Lapsed** | `not sovereign` | Nothing changes hands; the leader still sovereign counts as the winner. |
| **Bought peace** | `peace bought` | The defender pays the attacker; no land moves. |
| **Annexation** | `capital taken` | The defender's whole realm goes to the attacker, and the defender's subject relations are released. |
| **Cession** | Any other ending while the attacker occupies land | The attacker keeps the occupied provinces. |
| **Indemnity** or **white peace** | `occupation restored`, `offensive spent` or `offensive repelled`, with nothing occupied | The defender wins. It gets an indemnity with a chance that rises with its strength (see below); otherwise white peace. |
| **White peace** | Any other ending with nothing occupied (`both exhausted`, `no target`, `no troops`) | Nothing changes hands. |

- **Buy-off.** Offered only in a conquest war where the attacker occupies land and the defender's battle share (`MILITARY.threat`) is below 0.01. The price is `(1 − threat) × 20 × occupied share of the defender's output × defender revenue`, discounted to 60% against tribal and steppe attackers. The defender must hold that much in its treasury.
- **Indemnity chance.** `0.1 + 0.8 × max(0, 2 × threat − 1)`, where `threat` is the defender's battle share when the war ends: 10% for an even or weaker defender, rising to 90% for an overwhelming one. An indemnity makes the attacker pay the defender 10% of its revenue each year for 5 years, as long as the defender stays sovereign.
- **After every ending,** the two leaders become Suspicious and sign a 10-year truce. Occupations from the war are cleared, transferred provinces are repartitioned under their new realm, and the defender's remaining land is reconnected unless it was annexed.
- **Record.** The `war ended` note logs the winner, reason, outcome, transferred provinces, and any payment and payer. The war page shows the outcome as text: "Annexed", "Ceded n provinces", "White peace", "X owes Y 10% of its revenue for 5 years", "Y paid X n ducats for peace", or, for a lapsed war, "The war lapsed: X no longer rules a realm".

## Plunder and raids

| Action | Rule |
| --- | --- |
| Province plunder | 3% of annual province output; same province has a 5-year cooldown. |
| Capital sack | Also takes 20% of the loser's positive treasury. |
| Loot credited | Settled realm receives 1/3; tribal/steppe receives all, with no treasury ceiling. |
| Raid party | 25% of raider's fielded strength. |
| Raid response | 15% of victim's per-war force, with the 1.2 defense multiplier. |

Raids keep the squared force share and their own random loss shares (10% × force ratio, ×0.7–1.3, capped at 60%). Successful raids plunder province output but do not sack the victim's treasury.

## Scope

These rules describe the procedural `:history` simulation. Imported historical wars are translated into history records and do not run through this live army and battle engine.

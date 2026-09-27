# Armies and battles (`:history`)

Code: army economy and combat in `src/model/history/sim/engine/military`; army and manpower limits in `engine/economy` and `engine/knowledge`; war creation and settlement in `engine/state/index.ts`; war decisions in `engine/events/war`; scheduled battles in `engine/events/battle`.

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
| Initial rebellions | Seeded among eligible great districts whose threat against the sovereign exceeds 0.55. |
| Later interstate war | Periodic decision, usually every 5–10 years; independent, strong-crown realm picks its nearest viable neighbor if threat is below its relation threshold. |
| Later rebellion | Eligible district may break away if threat exceeds 0.55 (reduced when the crown is weak); its sovereign must not already be at war. |

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

Other relations have threshold 0 and are excluded by the eligibility rules. Rebellion threat compares the overlord's remaining force with the subject's estimated manpower share plus 25% of eligible sibling vassals' shares, scaled by a levy and treasury-dependent loyalty factor. It uses the same cubed force share formula.

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

Deployment shortfall is the share of the loser's assigned troops not yet deployed. A routed loser loses a further 5–20% of its remaining troops. The rout midpoint was calibrated to 0.40 so that about a third of contested battles rout; real battles are lopsided. An inconclusive battle without a rout blocks all progress: no plunder, sack, occupation, restoration, or capital victory. If one side has no troops, the other wins uncontested with no losses; if neither does, the war ends in stalemate.

Battle casualties reduce manpower and each realm's rural population proportionally. The battle record stores the result, pre-battle win probability, power share, terrain, knowledge-capped troops, deployments, losses, target province, and plunder.

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
| Loot credited | Settled realm receives 1/3; tribal/steppe receives all, with no treasury ceiling. |
| Raid party | 25% of raider's fielded strength. |
| Raid response | 15% of victim's per-war force, with the 1.2 defense multiplier. |

Raids keep the squared force share and their own random loss shares (10% × force ratio, ×0.7–1.3, capped at 60%). Successful raids plunder province output but do not sack the victim's treasury.

## Scope

These rules describe the procedural `:history` simulation. Imported historical wars are translated into history records and do not run through this live army and battle engine.

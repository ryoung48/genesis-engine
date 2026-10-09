# Armies, battles and war settlement

Scope: `:history`.

Armies are aggregate troop counts. This reference covers their budgets, deployment, combat and war outcomes. [Taxation](../population/output-and-taxation.md#economic-output-and-treasury-income) supplies civilian surplus; [rebellions](rebellions-and-throne-wars.md) defines civil-war triggers and endings.

Code: army economy and combat in `src/model/history/sim/engine/military`; recruitment and deployment operations in `engine/military`, field logistics in `engine/knowledge`; war creation and settlement in `engine/state/index.ts`; war decisions in `engine/events/war` (peaceful annexation in `war/submission`); scheduled battles in `engine/events/battle`, kind selection in `battle/kind`, siege phases in `engine/events/siege`, and shared occupation and settlement checks in `battle/conquest`.

Armies are aggregate troop counts. Combat strength is 0.75 per levy and 1 per regular; logistics, casualties, and recorded army sizes count soldiers. Affordability targets always use home upkeep prices; actual upkeep still follows peace/campaign deployment. The simulation tracks enrollment, field logistics, treasury support, war deployments, casualties, and occupied provinces; it does not track individual soldiers or units, and the only commander is a ruler leading in person (see [Command](#command)).

## Enrollment and recruitment

Sovereign realms hold actual enrolled levies and regulars. Soldiers remain inhabitants: recruitment does not remove population, demobilization does not grow it, and casualties reduce rural population once.

Levy eligibility is 2% of population for nontribal governments and 5% for all tribal-family governments, including steppe hordes. A separate 6% combined population safety ceiling covers both types. Neither type receives priority when the shared budget or safety ceiling binds. Government family changes only levy eligibility and permission to initiate raids in this military/fiscal model.

Let `B = 0.75 × max(0, civilian surplus)`. Requested levies equal population eligibility. Requested regulars equal `funding × B / regular home price`, using the full readiness budget without deducting levy costs first. Funding interpolates from 10% at knowledge 0.42 through 25% at 1.00 and 55% at 1.44 to 90% at 2.38. This defines requests rather than imposing a final composition.

Calculate the requested combined headcount `N` and home upkeep `C`. Multiply both types by the same factor `min(1, B / C, safety ceiling / N, logistics scale)`, treating empty requests as zero targets. Thus budget, population, and logistics limits preserve the independently requested contribution of each type. Remaining readiness budget is `B` minus the combined capped home upkeep; savings do not generate additional requests.

Initial armies receive their full affordable targets. Thereafter, levies close 10% of their target shortfall per peaceful year and zero during any recorded war participation. Regulars close 75% per year in peace or war. Exponential recovery makes these rates independent of time subdivision. Losses persist, target growth recruits gradually, and reduced targets demobilize excess without converting troops.

Field logistics gives diminishing returns rather than a ceiling. The knee `K` is interpolated from realm knowledge: 25,000 soldiers at knowledge 0, 40,000 at 1, 120,000 at 2, 250,000 at 3 and 600,000 at 4. A requested headcount `N` at or below `K` is unaffected; above it the logistics scale is `(K / N)^0.5`, so the enrolled total is `K^0.5 × N^0.5`. For example, a request of 288,000 with `K` = 31,900 enrolls about 95,900 rather than 31,900. The exponent 0.5 is a design value: foraging area grows with army size, so the distance a foraging army can sustain grows with its square root (van Creveld, *Supplying War*, 1977, ch. 1). The scale joins the common scaling above and is the only place enrollment is limited by logistics; there is no hard maximum, so budget and population can still bind first. Losses can still change actual composition, and raising the knee never refills troops instantly. A shrinking knee lowers the target, closes the old expense interval before demobilization and commitment trimming. Rebellion previews independently calculate both prospective realms. Reports identify the constraint that actually determines the common scale; a stricter budget or population ceiling does not count as logistics limiting the target.

## State maintenance and treasury

Civilian surplus supplies the army readiness budget. See [economic output, taxation and state maintenance](../population/output-and-taxation.md#economic-output-and-treasury-income) for revenue and administrative costs.

| Recruitment | Home / peace maintenance | Campaign maintenance |
| --- | ---: | ---: |
| Levy | 20 g silver per soldier-year | 62.5 g silver per soldier-year |
| Regular | 200 g silver per soldier-year | 625 g silver per soldier-year |

Both prices scale by `(realm output per resident / 450)^0.5` and the shared silver-to-ducat conversion. Upkeep integrates actual soldier-years, including gradual replacements, over each peace/campaign interval. Only mobilized commitments pay campaign prices. Battle logistics scaling does not reduce mobilized upkeep.

Tax settlement charges accumulated levy and regular expenses once, in full. Peace preserves pending campaign costs. The treasury UI shows one combined Army maintenance expense, labelled "settled interval" once the interval has settled. Every government may enter debt and shares a fiscal exhaustion threshold of half a year of positive civilian surplus. Strength exhaustion compares actual troops with 25% of affordable targets. An unarmed realm cannot join as a contributor.

A [coronation](government-and-succession.md#coronation) is an immediate one-off cash expense recorded as the negative "Coronation" budget row (`coronationExpenses`), beside bought peace and realm splits. It contributes once through `otherChangesTotal`; recurring tax/army settlement and `annualBalance` exclude it. Tax previews and settlement preserve this accumulator. Census snapshots record it, then reset it for the next interval.

One-off rows describe the preceding census interval under the frame's year heading. A dated founding appears on the title timeline at event time; its fee appears in the covering census afterward, then disappears from the next census. Frames between censuses retain the last recorded budget and cash. A payer with no census yet has no recorded economy, and a payer annexed before the next census never has a snapshot showing its fee. Prices and calibration uncertainty are documented in the title reference above.

The safe treasury is twice positive civilian surplus. Positive cash above that reference leaks annually at `0.04 × safe × (treasury / safe − 1)^2`, bounded by available cash. Every crown receives one third of battle, sack, and raid loot. Peace buyoff demands and rebellion threat follow shared rules.

## Deployment and coalition strength

Active wars store membership separately from troop commitments. Leads remain participants even at zero strength. Allies, vassals, union partners, and rebellion backers enter or leave through reconciliation at explicit mutation/event boundaries. New supporters need nonnegative cash after pending upkeep; existing supporters may stay until fiscal or strength exhaustion. Queries and previews cannot change membership or recruit troops.

The same holdings are shared across assignments. Opponent-weighted allocation splits 20% evenly and 80% by opposing strength, applying identical ratios to both types. Membership changes, losses, and explicit allocation mutations rebalance surviving troops. Ordinary advancement preserves stored fractions and recruits into them. Leaving one war releases commitments for the others; only final peace enables levy recovery.

Coalition battle attendance gives allies diminishing returns beyond the lead's own troops: with `T` the coalition's total deployed troops and `L` the larger of the lead's knee and the lead's own deployed troops, attendance scales both types by `(L / T)^0.5` when `T > L`. The lead's own troops are never reduced, because enrollment has already applied the logistics scale. Enrollment can exceed attendance. Each continuous participation episode retains a per-type high-water reference initialized from actual holdings on first entry. Losses and demobilization cannot lower it. Allocated reference is the rout-shortfall denominator; surviving commitments are the numerator. Final peace clears the episode. Faction releases settle the old realm's accrued costs, then independently reset both armies to their own affordable, population-safe, logistics-scaled levy and regular targets. No troops or military references transfer. Reset increases count as recruitment and decreases as demobilization; a release explicitly resets prior depletion, including during other wars. Ordinary wartime levy replacement remains disabled afterward.

## War starts

| Trigger | Rule |
| --- | --- |
| Initial interstate wars | Seeded among neighboring sovereigns; some start with occupied provinces and depleted troops. |
| Later interstate war | Periodic decision, usually every 5–10 years; independent, strong-crown realm picks its nearest viable neighbor (by distance from its capital to the neighbor's closest province) if threat is below its relation threshold. |
| Foreign claim | A foreign ruler next in a disputed single-heir succession declares a claim war on the realm if it would attack that neighbour for land (see [foreign claims](personal-unions.md#foreign-claims)). |
| Peaceful annexation | Before a declared war starts, a target whose threat is below 0.05 submits with 25% chance: it is annexed whole, with no war. |

A peaceful annexation is not a war: it has no war record, battles or truce, and does not count in war statistics. The annexed realm's subject relations are released, its provinces are repartitioned under the annexer, and its ruler is deposed. In the record, each annexed province's ownership change carries the comment "X was peacefully annexed by Y", and both realms' timelines get an Annexation row with the same sentence.

Rebellions have their own triggers, threat and endings; see [rebellion](rebellions-and-throne-wars.md).

Interstate attacks exclude every formal tie, including alliances, subject bonds, unions, colonies and active wars. Threat is calculated by cubed force share, with no terrain or defender bonus:

```text
threat = defender force³ / (attacker force³ + defender force³)
```

| Disposition | Attack threshold |
| --- | ---: |
| Rival | 0.8 |
| Suspicious | 0.6 |
| Neutral | 0.45 |
| Friendly | 0.1 |
| Trusted | 0 |

Formal ties are excluded before the disposition threshold is checked.

## Battle resolution

| Timing or target | Rule |
| --- | --- |
| First battle | 1–4 months after war creation or, for seeded wars, after simulation start. |
| After an inconclusive battle | 3–8 months. |
| After a normal victory | 2–10 months. |
| After a decisive victory, rout, or uncontested battle | 1–4 months. |
| Next attacker | The winner with 70% probability, the loser with 30%; an uncontested winner always keeps initiative. |
| War attacker holding nothing | Keeps attacking; after a loss it regroups for 3–8 months. |
| Invasion target | A defender province this war does not already hold, adjacent to the attacker's own provinces or to the war's occupied land. A province under a seat the war holds is already held and is not a target, but it gives access to what lies beyond it. A province another war took is a target again, and gives this war no access. |
| Restoration target | The most recently taken province the war still holds whose parent it does not hold: the defender goes for the seat, because a child retaken under a held seat would stay held through it. |
| Score check | Before a target is chosen, a war whose score is already at ±100 ends (see [war score](#war-score)). |
| Target check | When the battle runs; if the queued attacker has no target but the other side does, they swap roles. |
| No legal target for either side | War ends in stalemate. |

### Battle types

Once the target and encounter roles are resolved, the encounter becomes an `open` battle, `ambush`, `river crossing`, or `siege`. The encounter attacker can be the war's defender restoring an occupied province; bonuses follow encounter roles, not the original war declaration.

| Kind | Selection | Advantage |
| --- | --- | --- |
| Open | Always eligible; field weight 0.70. | Terrain only. |
| Ambush | Always eligible; field weight 0.05. | Ambusher gets ×1.3 combat strength; defender ambushes with 60% chance, attacker with 40%. |
| River crossing | Eligible only when the target has a river; field weight 0.12. | Defender gets ×1.2 in addition to terrain. |
| Siege | Target has at least 2,000 urban residents, a garrison of at least one troop, and besiegers stronger than the garrison. | Resolves through monthly phases, with wall defenses during assaults. |

When siege is eligible, it has a 95% selection probability. The remaining 5% is split among eligible field kinds by their relative weights. Without an eligible siege, those weights normalize over field kinds alone: without a river, about 93.3% open and 6.7% ambush; with a river, about 80.5% open, 5.7% ambush and 13.8% river crossing. River presence comes from the province's stored generated river data; town eligibility uses current urban population.

Open, ambush and river crossing resolve in one event. A siege starts without a field battle roll and suspends ordinary battles for that war until it ends. Each war can have one active siege.

### Field combat

The target province sets the defender's terrain bonus:

| Topography | Bonus | Vegetation | Bonus |
| --- | ---: | --- | ---: |
| Flat | 0% | Desert, sparse, grasslands | 0% |
| Hill | 10% | Woods | 5% |
| Plateau | 5% | Forest | 10% |
| Mountains | 20% | Jungle | 15% |
| Marsh | 15% | | |

Water codes at a land target count as flat grasslands. Terrain changes strength, never troop counts. The terrain multiplier is `T = 1 + topography bonus + vegetation bonus`; kind bonuses multiply it rather than replacing it. An attacking ambusher gets ×1.3 while the defender retains terrain; a defending ambusher gets `T × 1.3`; river-crossing defense is `T × 1.2`. Raids keep a flat 1.2 defense multiplier.

```text
S_A = attacking coalition combat strength × attacker multiplier
S_B = defending coalition combat strength × defender multiplier
N_A, N_B = attacking and defending coalition soldier counts
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

Deployment shortfall compares surviving commitments with their allocated participation-episode reference strength. Casualties and demobilization retain that reference until final peace. A routed loser loses a further 5–20% of its remaining troops. The rout midpoint was calibrated to 0.40 so that about a third of contested battles rout; real battles are lopsided. An inconclusive battle without a rout blocks all progress: no plunder, sack, occupation, restoration, or capital victory. If one side has no troops, the other wins uncontested with no losses; if neither does, the war ends (`no troops`).

Battle casualties reduce enrolled troops and each realm's rural population proportionally. Losses split among participating members by headcount, then by each member's own levy/regular mix. The battle record stores the kind, ambushing side, initial and final results, pre-battle win probability, power share, terrain, knowledge-capped troops, deployments, losses, target province, and plunder. Both war and nation timelines name the ambusher or river crossing; open battles add no special clause.

## Sieges

### Garrison and field forces

The starting garrison is `min(defending lead's levy eligibility × target urban population, 0.5 × defending coalition's physical deployed troops)`. Levy eligibility is the same 2% or 5% rate used for recruitment. The garrison is allocated proportionally among defending members and troop types, remains part of their deployment, and is not reduced by field logistics. Siege eligibility compares besiegers' logistics-scaled combat strength with this garrison's strength.

Each phase reads besiegers from current coalition deployments, so recruitment, allocation and membership changes affect them. Relief uses the defending coalition's deployments with the garrison subtracted **before** applying the field logistics scale. The garrison is reconciled to surviving commitments per troop type; departing coalition members leave the garrison without casualties.

All siege losses use the same enrolled-troop, deployment and rural-population accounting as field battles. Garrison losses also shrink the stored garrison; relief losses belong to troops outside it. Attrition and disease are percentages of besiegers' logistics-scaled soldier counts, charged as absolute losses to physical holdings. Siege clashes use the field combat resolver, including rout and pursuit, with deployment shortfall set to zero for both sides.

### Monthly phases

The first phase runs 30 days after the siege begins; subsequent phases are also 30 days apart. Each tick checks sovereignty and whether the target is still legally besieged, then reconciles the garrison. Invalid sieges lift. After 48 completed phases, a surviving siege lifts as `besiegers spent` on its next tick.

Each phase then applies 1% besieger attrition. Besiegers below one soldier lift the siege, including when both sides are empty. Otherwise a garrison below one soldier capitulates. With both present, let `R = current besieger combat strength / current garrison combat strength`. If `R < 0.75`, the siege lifts as `besiegers spent`. Otherwise there is a 1% chance a traitor opens the gates, ending it as `betrayed`.

If the siege continues, roll a d20 plus these modifiers:

| Term | Modifier |
| --- | ---: |
| `R < 1.25` | −2 |
| `1.25 ≤ R < 2` | 0 |
| `2 ≤ R < 3` | +1 |
| `3 ≤ R < 6` | +2 |
| `R ≥ 6` | +3 |
| Each breach | +2 |
| Each distinct shortage | +1 |
| Wearing down on phase `n` | `floor((n − 1) / 2)` |

| Modified roll | Beat | Effect |
| --- | --- | --- |
| ≤3 or 6–9 | Stalemate | No dice effect or beat record. |
| 4–5 | Disease | Besiegers lose another 4% of their troops. |
| 10–11 | Supplies shortage | Garrison loses 3%; add supplies shortage. |
| 12–13 | Food shortage | Garrison loses 5%; add food shortage. |
| 14–15 | Water shortage | Garrison loses 5%; add water shortage. |
| 16–17 | Breach | Add one breach; garrison loses 2%. |
| 18–19 | Desertion | Garrison loses 10%. |
| ≥20 | Surrender | Garrison capitulates. |

Each shortage can occur once; repeats act as stalemates. Capitulation, including an emptied garrison, ends as `starved out` if any shortage has occurred and `surrendered` otherwise. Food and supply stocks are not tracked separately.

If still standing, the phase checks a sortie, then an assault, then relief. The first terminal result ends the phase; a phase can otherwise record several beats.

| Action | Trigger | Fight and effect |
| --- | --- | --- |
| Sortie | `R < 3`; chance `min(0.4, 0.1 + 0.1 × breaches)`. | 20% of the garrison attacks 20% of the camp, with ×1.3 ambush strength against terrain defense. A non-inconclusive garrison win repairs one breach, or burns the works for another 3% besieger loss if no breach exists. Losses can empty the garrison and cause capitulation. |
| Assault | `R ≥ 1.5`; chance `min(0.9, 0.3 × breaches + desperation)`, where desperation is 0.5 if besieger strength is below 85% of its starting value, otherwise 0. | All besiegers attack the garrison; defense is `T × max(1, 1.5 − 0.15 × breaches)`. An emptied garrison or non-inconclusive besieger win ends as `stormed`. Otherwise a besieger loss lifts the siege as `repelled`; an inconclusive besieger win continues it. |
| Relief | Relief combat strength is at least 25% of besieger strength; 6% chance per phase. | Relief attacks the besiegers, who receive terrain defense. A non-inconclusive relief win ends as `relieved`; otherwise the siege continues. |

Ratios and forces are refreshed between these actions after losses. Destroying the garrison in an assault takes priority over the clash result, so even a lost or inconclusive assault can take the town.

### Outcomes, occupation and records

`surrendered`, `starved out`, `betrayed` and `stormed` take the province. In an invasion they occupy and plunder it; in restoration they clear occupation without plunder. A storm also removes 10% of current urban population and sacks an invaded province, even outside the capital. Other successful sieges sack only an invaded capital under the usual conquest rule. Capitulation and betrayal apply no additional garrison casualties.

`relieved` and `lifted` make no territorial progress. Lift reasons are `repelled`, `besiegers spent`, `invalid` or `war ended`. Peace clears an active siege as `lifted (war ended)`; its queued tick then does nothing.

Sieges ending in their own tick share occupation and settlement checks with field battles: a fall is handled as a normal attacker victory, while relief or lifting is handled as an inconclusive attacker loss. A fall changes the land or capital part of the [war score](#war-score) and adds nothing to the battle part. A siege tick first ends the war as `not sovereign` if either leader has stopped being sovereign, then ends it if the score is already at ±100, and only then checks its target and runs the phase. If the war continues, the next battle follows the corresponding delay and initiative rules above. During the siege, these post-combat checks wait until its end.

Sieges are stored separately in `war.sieges`, with start and end times, completed phase count, outcome, lift reason, forces, deployment snapshots and ordered beats. Sorties, assaults and relief are siege beats rather than additional field battle records. War and nation timelines show the start, each logged beat, and the end with elapsed calendar duration in 30-day months (or days for shorter sieges). Running sieges have no end entry.

Mobilization, field battles and siege events record physical deployments rather than logistics-scaled attendance. The war troop panel uses the latest snapshot at or before its displayed date, with later recorded events winning timestamp ties, and labels it "troops as of" that snapshot's date. Attrition and changes during an unlogged stalemate phase appear at the next logged event; missing members do not fall back to older troop counts.

## Occupation and war settlement

Code: occupation and war endings after field battles and siege endings share `engine/events/battle/conquest`; the terms are set in `engine/events/peace` (`PEACE.terms`, `PEACE.conclude`). This section covers conquest wars; rebel wars have their own endings (see [rebellion](rebellions-and-throne-wars.md#endings)).

### War score

Code: `engine/events/war/score` (`WAR_SCORE`); the land a war holds is `STATE.occupiedLand`.

Every war has a score from −100 to +100, positive for the attacker. It is computed whenever it is read and has no clock.

```text
score   = +100 if the defender is fully occupied, else
          clamp(battles + land + capital, −100, +100)
battles = war.battleScore                                          −100 … +50
land    = 50 × occupied share of the defender's non-capital output    0 … +50
capital = 50 while this war holds the defender's capital              0 or +50
```

- **Battles.** After a field battle with a winner the battle part moves toward the winner by `50 × the loser's loss share`, and is kept between −100 and +50. Inconclusive battles and sieges add nothing to it. The defender occupies nothing, so its whole score comes from battles; that is why the battle part reaches −100 but only +50.
- **Land.** Province output summed over the occupied land, without the capital, over the same sum for everything the defender owns, without the capital.
- **Capital.** A realm's capital is its root province. It is worth as much as all the defender's other land together, and it is not counted as land, so holding it alone gives exactly 50.
- **Full occupation.** When the war holds every province the defender owns, the score is +100 whatever the battle part says.

Which war a province counts for is decided by the occupation marks, never by a war's own list of what it took:

- A province with an occupation mark counts for the war the mark names.
- An unmarked province counts for the war that holds its parent, so a held seat brings its whole district.
- The capital covers only itself: an unmarked province directly under it counts for no war.

Every province therefore counts for at most one war. When another war takes a child of a held seat, the child and everything under it pass to that war. When the defender retakes the child while the seat is still held, it is back under the seat's war. When the defender retakes the seat, everything unmarked under it is free.

| Constant | Value | Source |
| --- | ---: | --- |
| Score range | −100…100 | CK3 war score scale. |
| Battle scale | 50 × loser's loss share | CK3 `WAR_ATTACKER_COMBAT_SCORE_SCALE = WAR_DEFENDER_COMBAT_SCORE_SCALE = 50`. |
| Attacker battle cap | +50 | CK3 `MAX_ATTACKER_BATTLES_WAR_SCORE = 50`. |
| Defender battle cap | −100 | CK3 `MAX_DEFENDER_BATTLES_WAR_SCORE = 100`. |
| Land weight | 50 | The half of the scale battles cannot give the attacker. A design choice. |
| Capital bonus | 50 | Equal to the land weight. CK3 gives 10; a design choice. |

Worked example, a conquest war against a realm of three provinces: capital C, and A and B with 58.3% and 41.7% of the non-capital output.

| Step | What happens | Battles | Land | Capital | Score |
| --- | --- | ---: | ---: | ---: | ---: |
| Start | Nothing occupied. | 0 | 0 | 0 | 0 |
| 1 | The attacker wins at C; the defender loses 10% of its army. | +5 | 0 | +50 | +55 |
| 2 | The defender fails to retake C and loses 30%. | +20 | 0 | +50 | +70 |
| 3 | The attacker wins at A; the defender loses 20%. | +30 | +29.2 | +50 | +100 (clamped from 109.2) |

The war ends at step 3 as `enforced`. Had it ended for any other reason after step 1, the attacker would still take the whole realm, because it holds the capital.

### Endings

A war ends when the first of these holds, in this order:

| Reason | When |
| --- | --- |
| `not sovereign` | Before a battle or siege phase, either war leader is no longer sovereign. |
| `enforced` | The score is +100. Checked before a battle or siege phase and after every battle and finished siege. |
| `defended` | The score is −100, checked at the same moments. |
| `no target` | Neither side has a legal target. |
| `no troops` | Neither side has troops in the field. |
| `both exhausted` | Both war leaders are exhausted. |
| `offensive spent` | The attacker holds nothing and is exhausted after its own attack. |
| `offensive repelled` | The attacker holds nothing and has just lost its own attack. The defender then ends the war with 40% chance after a decisive win, 75% after a rout and 90% after an uncontested win; otherwise the attacker regroups for 3–8 months and tries again. |
| `claim lapsed` | A claim war whose claim no longer stands, checked before a battle or siege phase and after each. Takes precedence over every other ending. |
| `peace bought` | Any other battle, if the defender can afford a buy-off and accepts it (25% chance). |
| `negotiated` | Any other battle, if a deal is offered and accepted (see below). |

A leader is exhausted when its army is below 15% of its target strength, or its treasury is below minus half a year's surplus. Taking the capital does not end a war by itself, and neither does the defender winning back its last occupied province: the attacker then holds nothing and attacks again, or gives up through `offensive spent` or `offensive repelled`.

The reason then sets the terms:

| Terms | When | Result |
| --- | --- | --- |
| **Lapsed** | `not sovereign` | Nothing changes hands; the leader still sovereign counts as the winner. |
| **Bought peace** | `peace bought` | The defender pays the attacker; no land moves. |
| **Union** | A claim war ending `enforced`, or any other ending while the attacker holds the capital, with the claim standing | The claimant takes the defender's throne and the realms form a personal union. No land moves. |
| **Annexation** | `enforced`, or any other ending while the attacker holds the capital | The defender's whole realm goes to the attacker, and the defender's subject relations are released. |
| **Cession** | Any other ending while the attacker holds land on a positive score | The attacker keeps the occupied land. After a `negotiated` peace one side may also pay an indemnity (see below). |
| **Indemnity** or **white peace** | `defended`, `offensive spent` or `offensive repelled`, with nothing ceded | The defender wins. It gets an indemnity with a chance that rises with its strength (see below); otherwise white peace. |
| **White peace** | Any other ending with nothing ceded, including land held on a score of zero or less | Nothing changes hands. |

- **Buy-off.** Offered only in a conquest war where the attacker holds land but not the capital, and the defender's battle share (`MILITARY.threat`) is below 0.01. The price is `(1 − threat) × 20 × occupied share of the defender's output × defender revenue` for every government. The defender must hold that much in its treasury. It is rolled at 25% after each battle that qualifies.
- **Negotiated peace.** At most one offer per war. After a battle or finished siege, when the attacker holds land but not the capital, an offer is made with 10% chance if either the attacker's side came off worse (it lost, a province was retaken, its own siege failed, or an inconclusive battle went against it) or its side won and the score is +50 or more. The offer is accepted half the time. The attacker keeps the land it holds, and in a conquest war the score sets who pays the indemnity of 10% of revenue for 5 years:

  | Score at the offer | Terms |
  | --- | --- |
  | +50 or more | The attacker keeps the land and the defender pays. |
  | +10 to +50 | The attacker keeps the land; nobody pays. |
  | Above 0, below +10 | The attacker keeps the land and pays the defender. |
  | 0 or below (conquest wars only) | White peace: the land goes back and nobody pays. |

  Rebel wars get the plain terms at any positive score, with no payment.
- **Indemnity chance.** `0.1 + 0.8 × max(0, 2 × threat − 1)`, where `threat` is the defender's battle share when the war ends: 10% for an even or weaker defender, rising to 90% for an overwhelming one. An indemnity makes the attacker pay the defender 10% of its revenue each year for 5 years, as long as the defender stays sovereign.
- **Cut-off land.** When a peace gives the attacker land, each of the defender's districts that this leaves without a connection to its capital and that borders the attacker's land goes to the attacker as well. Cut-off districts that do not border the attacker are released as new realms, as after any other peace that leaves the defender standing.
- **Claim wars.** A claim war never moves land: occupied land goes back at every ending whatever the score, and it takes neither buy-off nor negotiated peace. A `claim lapsed` ending is a lapsed outcome with the defender as winner.
- **After every ending but a union,** the two leaders become Suspicious and sign a 10-year truce. Occupations from the war are cleared, and transferred provinces are repartitioned under their new realm.
- **Record.** The `war ended` note logs the winner, reason, outcome, transferred provinces (including cut-off land that went with them), any payment and payer, and the final score with its battle, land and capital parts. The war page shows the final score and the outcome as text: "Annexed", "Ceded n provinces", "White peace", "X owes Y 10% of its revenue for 5 years", "Y paid X n ducats for peace", for a union, "Personal union under X"; for a lapsed claim, "The claim lapsed"; or, for a lapsed war, "The war lapsed: X no longer rules a realm".

## Plunder and raids

| Action | Rule |
| --- | --- |
| Province plunder | 3% of annual province output; same province has a 5-year cooldown. |
| Capital sack | Also takes 20% of the loser's positive treasury. |
| Loot credited | Every crown receives 1/3, with no treasury ceiling. |
| Raid party | 25% of the raider's enrolled troops. |
| Raid response | 15% of victim's per-war force, with the 1.2 defense multiplier. |

Raids keep the squared force share and their own random loss shares (10% × force ratio, ×0.7–1.3, capped at 60%). Successful raids plunder province output but do not sack the victim's treasury.

## Scope

These rules describe the procedural `:history` simulation. Imported historical wars are translated into history records and do not run through this live army and battle engine; their battles have no simulated kind, and their siege lists are empty.

Rebellion previews calculate each prospective territory with the same economy and recruitment formulas used after release. Crown territory excludes the departing subject; both armies use their own knowledge-derived limits. Potential support and the existing-war discount remain preview estimates.

## Attribute and trait effects

Each side's war leader supplies the field commander. Its governor's martial attribute multiplies field strength by `clamp(1 + 0.025 × (martial - 5.4), 0.87, 1.21)`, alongside terrain and battle-kind modifiers, in every field battle and whoever leads: a regent's martial counts for a regent-governed realm. Sieges and raids do not use commander character. See [attributes and traits](../people/attributes-and-traits.md) for the full rules.

## Command

Code: `src/model/history/sim/engine/events/battle/command` (`COMMAND`).

Before each field battle, each side's ruler may take the field in person (`COMMAND.lead`). Leading is separate from the governor's martial multiplier above and adds only a risk and one penalty.

- **Who leads.** The realm's ruler, if 16 or older, ruling without a regent, with effective health above 3, and not Infirm, Blind or Incapable ([health](../people/health-and-mortality.md)).
- **Once a year.** A ruler leads at most one field battle a calendar year (`ledYear`, set when they are chosen, whether or not they survive). The simulation does not track where a ruler is, so one battle a year stands for one campaign with one army, and it bounds the yearly risk of a realm fighting on several fronts.
- **Fragile Bones.** The leader's army is multiplied by `clamp(1 + 0.01 × advantage, 0.5, 1)`, where advantage is the condition's summed rows (−3 to −24). An army whose ruler does not lead takes no such penalty. Leading also makes the condition's next yearly progression more likely to be its largest gain; the note is used by one pulse.
- **Risk.** One hash roll per led battle (channel 1040, salted by the battle's time). The leader is killed if it is below `(5 / 1040) × max(0.1, (30 − prowess) / 30) × temper × odds`: temper is 2 for Brave and 0.5 for Craven, and odds is `min(1, 1.4 × enemy / own)` for the side with the larger army, else 1. At prowess 6 with neither trait that is 0.385% per led battle. The 5 and 1040 are CK3's commander event weights; its wounds and maimings are not modelled, and its precondition that the commander is already wounded or weak is dropped with them.
- **Death.** A killed leader dies once the battle is settled, with cause `battle`; their succession follows at once and any pending natural death goes stale ([families](../people/families-and-lifecycle.md#death)).

The `battle` note carries each side's leader and whether they fell.

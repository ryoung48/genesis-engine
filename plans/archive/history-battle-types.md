# Battle types: open, ambush, river crossing, siege (:history)

Status: proposed, revised after plan review. This document plans the implementation; it does not change simulation behavior.

## Objective

Every history battle is currently one roll in `MILITARY.fight` with a terrain `defense` multiplier. Give each battle a type that changes who has the advantage and how long it lasts:

| Type | Advantage | Duration | Eligibility |
| --- | --- | --- | --- |
| `open` | none | one event | always |
| `ambush` | either side, defenders slightly likelier | one event | always |
| `river crossing` | defender | one event | target province has a river |
| `siege` | defender, plus attrition mechanics | many events over months | target province has a town or city |

Open battles carry the most weight. Ambush is a small chance. River crossing and siege are moderate chances, gated on the province.

## Current behavior

- `BATTLE.runBattle` (`events/battle/index.ts`) picks a target province, calls `TERRAIN.battlefield` for `defense`, then `MILITARY.fight`, which rolls `log(attackerForce / (defenderForce * defense)) + logit(u) / BATTLE_EXPONENT`.
- `DEFENDER_BONUS` (1.2) is used only by `raid`. `fight` has no bonus beyond terrain, so today's "open" battle is already symmetric apart from terrain.
- A battle that the attacker wins with a non-`inconclusive` outcome occupies the target province immediately. The next battle is queued 1-10 months later via `STATE.queueBattleEvent` (heap event `BATTLE`, data `warIdx`, `attacker`). That event is the only thing that schedules a war's tempo.
- `fight` builds both whole-side coalitions from `war.deployed`, rolls once, and applies losses immediately through `applyLosses`.
- A restoration battle has the war's defender attacking the war's attacker, so `war.attacker` does not identify the aggressor; `runBattle` carries it as `battle.attacker`.
- `riverVisible` is only an init-time input (`state/index.ts` consumes it for water access). It is not stored per province in `HistoryState`. Urban population is `popUrbanCurrent[p]`.

## Model decisions

### Battle type selection

New domain `events/battle/kind` (`{index.ts, types.ts}`, namespace `BATTLE_KIND`). It owns type selection and the per-type modifiers. `runBattle` calls `BATTLE_KIND.choose` once the target is resolved, then dispatches.

```
type BattleKind = "open" | "ambush" | "river crossing" | "siege"
```

Selection is a weighted draw over the eligible kinds:

| Kind | Weight | Condition |
| --- | --- | --- |
| open | 0.70 | always |
| ambush | 0.05 | always; side picked below |
| river crossing | 0.12 | `TERRAIN.hasRiver` for the target |
| siege | 0.15 | `popUrbanCurrent[target] >= TOWN_URBAN_POPULATION` and the siege can start (below) |

Weights are relative: ineligible kinds are dropped before normalising. A province with no river and no town resolves to 93% open / 7% ambush (0.05 / 0.75); with a river only, 5.7% ambush; with all four kinds, 4.9%. Open always dominates, and the verification band for ambush is 3-9% of battles.

Ambush side: the ambusher is the defender with probability 0.6, else the attacker (defenders know the ground).

A siege can start only if the garrison is non-empty and the besiegers' force exceeds the garrison's (see Siege). Otherwise the siege is dropped from the draw and the remaining kinds are drawn.

### Shared combat resolver

`MILITARY.fight` today both selects whole-side coalitions and applies losses. Siege needs fights between arbitrary troop subsets (a 20% sortie party, the garrison alone, a relief force that excludes the garrison). Split it:

- `MILITARY.clash({ attackers, defenders, attackerShortfall, defenderShortfall, attackerMultiplier, defenderMultiplier, rng })`: pure. `attackers` and `defenders` are `CoalitionMember[]`. It runs the roll, rout and pursuit exactly as `fight` does today and returns `{ attackerWon, outcome, initialOutcome, powerShare, preBattleWinProbability, attackerLosses, defenderLosses }`, with losses as absolute troop totals. It touches no state. The rout score uses the losing side's `shortfall` (`ROUT_SHORTFALL_WEIGHT × loserShortfall`), which is a property of a whole coalition and not of a member, so it is passed in: `fight` passes each coalition's own `shortfall`, and every siege fight passes `0` for both (a garrison, a party or a relief force has no participation-episode shortfall).
- `MILITARY.casualties({ members, losses })`: pure. Splits an absolute loss over the supplied members pro rata by their committed troops, then splits each member's share into levies and regulars by **that member's own** levy/regular mix, returning `Record<nation, Troops>`.
- `MILITARY.applyTroopLosses({ state, war, losses })`: the body of today's `applyLosses` loop, taking exact per-nation levy and regular losses. It subtracts them from the holdings, from `war.deployed`, and from the interval and total casualties, and reduces rural population as today.
- `MILITARY.applyLosses({ state, war, members, losses })` becomes `casualties` followed by `applyTroopLosses`. For whole coalitions (whose members mirror `war.deployed`, including the logistics scaling, which preserves the mix) this gives today's results exactly, so `fight` and `raid` are unchanged.
- `MILITARY.fight` becomes: build both coalitions, handle the empty and uncontested cases, call `clash` with the coalitions' shortfalls, then apply the returned losses to each side. Output for an `open` battle must equal today's results exactly, and a test asserts that.

**Who owns siege casualties.** A siege fight calls `clash` on the exact members it wants and applies the result through `casualties` and `applyTroopLosses`, so each side's losses follow that side's own mix, not the whole deployment's:

- garrison losses (shortage, breach, desertion, sortie party, assault) are split over the garrison map by its own levy/regular mix, subtracted from `war.deployed` and holdings through `applyTroopLosses`, and also subtracted from `siege.garrison[nation]` per troop type (never below zero). The garrison must shrink in both places or it would stay full while the deployment drops;
- besiegers' losses (attrition, disease, assault, sortie camp party, relief) are split over the besieging members and applied through `applyTroopLosses`, the same accounting path as every other casualty (holdings, `war.deployed`, interval and total casualty counts, rural population), so recruitment and allocation cannot restore them. They never touch `siege.garrison`;
- relief casualties are split over the relief force (each nation's deployed troops minus its garrison troops, per type), so they come out of troops outside the garrison and cannot reach it.

`FightParams.defense` is replaced by `attackerMultiplier` and `defenderMultiplier`, produced by `BATTLE_KIND.modifiers({ kind, terrain, ambusher })`.

**Stacking rule.** The defender of any clash always gets `terrain.defense` (1 + topography + vegetation), and every kind-specific bonus multiplies with it; nothing replaces or cancels terrain. The attacker's multiplier is 1 unless a kind gives the attacker a bonus. So:

- open: attacker 1, defender `terrain.defense`.
- ambush: a defender ambusher has `defenderMultiplier = terrain.defense × AMBUSH_BONUS`; an attacker ambusher has `attackerMultiplier = AMBUSH_BONUS` while the defender keeps `terrain.defense`.
- river crossing: defender gets `terrain.defense × RIVER_CROSSING_BONUS` (1.2), so a river through hills gives `(1 + hill) × 1.2`. When the event attacker is restoring a lost province from the occupier, the bonus goes to whichever side is defending the target.
- siege: no multiplier here; the siege module calls `clash` itself and applies the same stacking rule (below).

The reported `preBattleWinProbability` and `powerShare` are computed from the modified forces.

### Siege

Sieges are the only multi-event battle type. The design combines the phase-and-dice model from EU4 ([Land warfare#Sieges](https://eu4.paradoxwikis.com/Land_warfare#Sieges)) and EU5 ([Combat#Sieges](https://eu5.paradoxwikis.com/Combat#Sieges)) with CK3's slow pace ([Warfare#Siege](https://ck3.paradoxwikis.com/Warfare#Siege)). The aim is a siege that reads as a story in the history log, not a progress bar. There are no fort levels, and no food or supply stock is tracked: shortages are dice results that make the siege shorter. A siege is shaped by the garrison's real size, the besiegers' real strength, and chance.

The wiki figures were read through a summarising fetch; re-check any number before hardcoding.

#### What we take from each reference

- **EU5:** a monthly phase, one dice roll per phase, and a result table whose outcomes are story beats (disease, shortage, desertion, surrender). Assault is an explicit gamble.
- **EU4:** sorties (garrison strikes the besiegers) and the choice between grinding it out and storming.
- **CK3:** long duration, besiegers must outnumber the garrison, and besiegers bleed from attrition while they wait.

Fort levels, siege-weapon stats, leader siege skill, artillery and naval blockades are left out.

#### State

Held on the `War`, one siege at a time per war:

```
interface Siege {
  province: number
  startTime: number
  phase: number
  besieger: number
  besiegerSide: WarSide
  startBesiegerStrength: number
  garrison: Record<number, Troops>
  startGarrison: number
  shortages: Shortage[]
  breaches: number
}

type Shortage = "supplies" | "food" | "water"
```

`War.siege: Siege | null` (`null`, not an optional attribute, so no `[JUSTIFICATION]` is needed).

- `besieger` and `besiegerSide`: the nation leading the besieging side and its side, taken from `battle.attacker` at start. A restoration siege has the war's defender besieging, so these two fields, not `war.attacker`, identify the aggressor; the other side defends.
- Besiegers are not stored. Each phase their combat troops are read from `war.deployed` for the besieging side through `MILITARY.coalition`, which scales them to the lead's logistics cap, so recruitment, coalition membership changes and allocation across other wars flow into the siege automatically. `startBesiegerStrength` is only the baseline for measuring how much they have bled.
- `garrison`: per defending-side nation, the levy and regular troops held inside the walls. It is carved out of the nations' `war.deployed` at start and stays part of it. Losses are subtracted from both this map and `war.deployed`, as described under garrison casualties above. Each phase the garrison is reconciled: a nation that has left the defending side drops out of the map (its men leave the siege, they are not counted as casualties), and each entry is clamped to that nation's current `war.deployed`.
- `startGarrison`: the garrison's total troops at start, used for logging and to size party fights.
- `shortages`: the distinct kinds suffered so far. Its length is the roll modifier; a kind already in the list cannot recur.
- `breaches`: damage to the defences.

Garrison size at start: `min(levyEligibility × the target's urban population, SIEGE_GARRISON_FIELD_CAP (0.5) × the defending side's deployed troops)`, where `levyEligibility` is the defending lead's own rate (0.02, or 0.05 for tribal-family governments, from `recruitment/index.ts`). It is split pro rata over the deployed levies and regulars of each defending-side nation, so the garrison has the same levy/regular mix as the deployed army. A siege can start only if this is at least 1 troop and the besiegers' force exceeds the garrison's force.

**Ratio.** `R = ARMY_STRENGTH of the besiegers now ÷ ARMY_STRENGTH of the garrison now`. It compares the besiegers to the garrison itself, not to the defender's whole army, so a 12,000-man army against a 100-man garrison starts at R ≈ 120, however large the defender's field army is. Town size therefore changes initial odds as well as casualties. The defender's field army matters through relief only.

**Physical versus combat troops (logistics).** Two quantities are kept apart:

- *Physical troops* are what exists: `war.deployed` and the holdings. Garrison sizing uses them (the 0.5 field cap is a share of the defending side's physical deployed troops), and casualties are always charged to them.
- *Combat troops* are what can take the field: the output of `MILITARY.coalition`, scaled to the side lead's logistics cap (`KNOWLEDGE.maxFieldArmy`, applied when total troops exceed it). Besiegers and the relief force are field armies, so both are combat troops. The garrison is inside the walls, not a field army, so it is not scaled.

`MILITARY.coalition` gains a required `excluded: Record<number, Troops>` parameter, removed from each member before the cap is applied (`{}` for ordinary fights and for the besiegers). The relief force is `coalition` over the defending side with `excluded` set to the garrison map, so it is the defender's deployed troops minus the garrison, scaled to the defending lead's cap. With 10,000 deployed defenders, a cap of 1,000 and a 100-man garrison, relief is 1,000 combat troops, not 9,900.

The siege uses these consistently:

| Use | Quantity |
| --- | --- |
| siege eligibility (besiegers stronger than garrison) | besiegers' combat strength vs garrison strength |
| `R`, desperation, `startBesiegerStrength` | besiegers' combat strength (current and at start) |
| attrition, disease | a percentage of the besiegers' combat troops, charged to physical troops |
| sortie parties | 20% of the besiegers' combat troops vs 20% of the garrison |
| assault | the besiegers' combat troops vs the garrison |
| relief eligibility and fight | the relief force's combat troops |
| garrison size, garrison share of deployed | physical troops |
| every casualty | absolute losses from the (scaled) fight, charged to physical troops, as `applyLosses` does today |

#### Phase (new heap event `SIEGE`, 30 days apart, data `warIdx`)

`SIEGE.tick` begins by returning immediately, before reading siege state or drawing any randomness, if `war.endTime` is set or `war.siege` is `null`. A peace that ends the war clears `war.siege` but leaves the next tick queued in the heap, so this guard is what stops a stale tick from ending the siege twice, applying casualties or occupation, or queuing a battle. A siege only ends inside its own tick (which then queues no further tick) or when the war ends, so a stale tick can only follow a war end.

`BATTLE` does not run for the war while it is besieged: the event that started the siege has been dequeued and the only event queued for the war is `SIEGE`.

1. **Start.** `runBattle` draws `siege`, builds the `Siege`, logs `siege started`, and enqueues the first `SIEGE` tick. No battle is rolled.
2. **Each phase** runs these steps in order, and the first terminal result ends the phase and the siege:

   | Step | What happens | Terminal result |
   | --- | --- | --- |
   | 1. Validity and reconciliation | Same sovereignty checks as `runBattle`: both leads sovereign; the target is still held by the defending side and (for a normal siege) not yet occupied by this war, or (for a restoration siege) still occupied by it. Otherwise the siege is invalid. Then the garrison map is reconciled with `war.deployed` (nations that left the defending side dropped, each entry clamped per type) | `lifted`, reason `invalid` |
   | 2. Attrition | Besiegers lose `SIEGE_ATTRITION_MONTHLY` (1%) of their troops | none |
   | 3. Empty sides | Checked before any ratio is computed. If the besiegers have fewer than `SIEGE_GARRISON_DESTROYED` (1) troops, including when both sides are empty: `lifted`. Otherwise, if the garrison has fewer than 1 troop (an allocation or membership change emptied it): the undefended town falls and no gates roll is made | `lifted`, reason `besiegers spent`; or `starved out` if `shortages` is non-empty, otherwise `surrendered` |
   | 4. Besiegers spent | `R` < `SIEGE_ABANDON_SHARE` (0.75) | `lifted`, reason `besiegers spent` |
   | 5. Gates | With probability `SIEGE_GATES_CHANCE` (1%), a traitor opens the gates | `betrayed` |
   | 6. Dice | Roll `d20 + modifier` and apply the beat in the table below | `surrendered` or `starved out` if the roll is ≥ 20, or if the garrison is destroyed |
   | 7. Sortie | If still standing and `R` allows, maybe a sortie (below) | `starved out` or `surrendered` only if it destroys the garrison |
   | 8. Assault | If still standing, maybe storm (below) | `stormed`, `lifted`, or none |
   | 9. Relief | If still standing, maybe a relief attempt (below) | `relieved` or none |

   The dice modifier is the sum of:

   | Term | Value |
   | --- | --- |
   | `R` below 1.25 | `-2` |
   | `R` from 1.25 to below 2 | `0` |
   | `R` from 2 to below 3 | `+1` |
   | `R` from 3 to below 6 | `+2` |
   | `R` of 6 or more | `+3` |
   | each breach | `+2` |
   | each shortage kind suffered | `+1` |
   | wearing down: `floor((n − 1) / SIEGE_WEARING_PHASES)` on phase `n`, i.e. one per 2 phases already completed before this one (first `+1` on phase 3) | `+1` each |

   Dice beats:

   | Roll | Beat | Effect |
   | --- | --- | --- |
   | 4-5 | **Disease in the camp** | Besiegers lose `DISEASE_LOSS` (4%) |
   | ≤ 3, 6-9 | **Stalemate** | Nothing (not logged) |
   | 10-11 | **Supplies shortage** | Garrison loses `SHORTAGE_LOSS.supplies` (3%); `supplies` added to `shortages` |
   | 12-13 | **Food shortage** | Garrison loses `SHORTAGE_LOSS.food` (5%); `food` added |
   | 14-15 | **Water shortage** | Garrison loses `SHORTAGE_LOSS.water` (5%); `water` added |
   | 16-17 | **Breach** | `breaches += 1`; garrison loses `BREACH_GARRISON_LOSS` (2%) |
   | 18-19 | **Desertion** | Garrison loses `DESERTION_LOSS` (10%) |
   | ≥ 20 | **Surrender** | The garrison capitulates |

   A shortage roll for a kind already in `shortages` is a stalemate. All garrison losses are real troop losses, applied as described under garrison casualties.

3. **Sortie** (step 7). Only if `R` < `SORTIE_MAX_RATIO` (3): a garrison does not sally against hopeless odds. Chance = `min(SORTIE_CAP (0.4), SORTIE_BASE_CHANCE (0.10) + SORTIE_PER_BREACH (0.10) × breaches)`, so a breach makes a sortie likelier, which is the point of it. It has its own trigger, not a dice band, so it stays reachable whatever the ratio and breach modifiers do to the roll. If it triggers, `clash` a garrison party (`SORTIE_PARTY_SHARE` 0.20 of the garrison's troops, as attacker, multiplier `AMBUSH_BONUS`) against a camp party (0.20 of the besiegers' troops, as defender, multiplier `terrain.defense`), shortfalls 0. Losses go to those party members only; the garrison party's losses are also subtracted from `siege.garrison`. If the garrison wins and the outcome is not `inconclusive`, it wrecks the siege works: one breach is removed if there is any, otherwise the besiegers lose `SORTIE_DISRUPTION` (3%) of their troops. A loss costs the garrison its party losses and nothing else. A sortie never ends the siege unless its losses destroy the garrison.
4. **Assault** (step 8). Only if `R` ≥ `ASSAULT_MIN_RATIO` (1.5). Chance = `min(0.9, 0.3 × breaches + (besiegers' strength < (1 − SIEGE_DESPERATION) × startBesiegerStrength ? 0.5 : 0))`, with `SIEGE_DESPERATION` 0.15. If it triggers, `clash` the whole besieging force against the garrison alone, with defender multiplier `terrain.defense × max(1.0, ASSAULT_WALL_BONUS − 0.15 × breaches)` and `ASSAULT_WALL_BONUS` 1.5. Losses are applied as described under garrison casualties. Result, matching the existing battle rule (`attackerWon` and not `inconclusive` counts as progress):
   - besiegers win and the outcome is not `inconclusive`: the town is stormed. Sack (`sack: true`) and remove `STORM_URBAN_LOSS` (10%) of its urban population.
   - garrison destroyed by the assault: counts as stormed. This is checked first and overrides the two cases below.
   - besiegers lose: the siege lifts, reason `repelled`.
   - besiegers win with `inconclusive`: no result; both sides keep their losses and the siege continues.
5. **Relief** (step 9). The relief force is `MILITARY.coalition` over the defending side with the garrison excluded (see Physical versus combat troops). It is attempted only if its combat strength ≥ `RELIEF_MIN_RATIO` (0.25) × the besiegers' strength, with chance `RELIEF_CHANCE` (0.06) per phase. If it triggers, `clash` the relief force (as attacker, multiplier 1) against the besiegers (defender multiplier `terrain.defense`), and apply losses to both (relief casualties come from the relief force only). A win that is not `inconclusive` lifts the siege as `relieved`; anything else leaves the siege running.

#### Outcomes and precedence

Within a phase the order in the step table above is the precedence: the first terminal result wins and nothing after it runs. Outcomes are decided from explicit state at the moment of the terminal event, never from earlier beats:

| Terminal event | Outcome |
| --- | --- |
| roll ≥ 20, or garrison destroyed by a dice beat, a sortie, or already empty at step 3 | `starved out` if `shortages` is non-empty, otherwise `surrendered` |
| gates | `betrayed` |
| assault win (including garrison destroyed in an assault) | `stormed` |
| relief win | `relieved` |
| assault lost | `lifted`, reason `repelled` |
| besiegers empty (including both sides empty), or `R` below the abandon share | `lifted`, reason `besiegers spent` |
| validity failure | `lifted`, reason `invalid` |
| war ended while besieged (peace, sovereignty change, rebellion end) | `lifted`, reason `war ended` |

A fall (`surrendered`, `starved out`, `betrayed`, `stormed`) runs occupation, plunder and the peace checks. A `relieved` or `lifted` siege queues the war's next battle with `inconclusive` timing. Both go through the shared `CONQUEST.apply` (see Module layout), which also owns queuing the next `BATTLE` event; this is the only place a siege hands control back to the battle loop.

The one exception is `lifted` with reason `war ended`. That siege is closed by the war-ending path itself, not by a tick: `SIEGE.end` only pushes `siege ended` and clears `war.siege`. It does not call `CONQUEST.apply`, runs no occupation, plunder or peace check, and queues no `BATTLE` or `SIEGE` event, since the war it would hand back to is over. So `SIEGE.end` never calls `CONQUEST.apply`; the tick calls `SIEGE.end` and then `CONQUEST.apply` for the endings it decides itself.

`SIEGE_MAX_PHASES` (48) lifts the siege with reason `besiegers spent` as a pure guard; the calibration never reaches it.

#### Lifecycle

- `SIEGE.end({ state, war, outcome, reason })` is the only way `war.siege` is cleared. It pushes the `siege ended` event, then clears the field.
- Every path that ends a war must call it first. `PEACE.conclude` is the main one; step 6 of the implementation audits every caller of `resolveWar` and routes any other war-ending path through it, so an ended war never has a siege and every `siege started` has a matching `siege ended`.
- Sovereignty and occupation are revalidated at the start of every phase (step 1), so changes between ticks cannot strand a siege.

#### Calibration

Implemented calibration: `src/test/history-run/siege.smoke.test.ts` runs the production siege loop and military casualty/clash logic, with seed 2025 and 20,000 runs per scenario. The final grid includes flat ground and hills, physical multiples 1 and 10, relief multiples 0 and 0.5, the five original ratios, and the initial world's minimum/median/maximum eligible ratios (8.433626876656279, 118.8284912341113, 320.4382529310275). All 64 scenarios pass: median 3-7 phases, p99 8-15, maximum 23, falls at least 91.23%, betrayal at most 7.465%, and storms 14.16-18.275% for ratios of at least 2. No run reaches the phase cap. The wearing interval was changed to 2 after the production loop at 3 produced a median of 8 at ratio 1.2. The Python script was rerun against the initial-world ratio spread and then removed after the TypeScript port passed. The table and Python description below document the original pre-implementation calibration, whose wearing interval was 3.

The constants were set by Monte Carlo over the phase loop, kept in `plans/history-battle-types-calibration.py` (seed 2025, 20,000 runs per scenario) and to be ported to a seeded TypeScript test in `src/test/history-run/` and deleted from `plans/` once ported. It implements the plan's rules: the real `clash` formula (roll with `BATTLE_EXPONENT` 3, casualties with `BATTLE_LOSS_SCALE` 0.2, rout and pursuit with shortfall 0), the garrison-based `R`, the phase order above including the empty-side check, the separate sortie trigger, relief casualties applied to both sides, a 1-troop destroyed threshold (the garrison starts at 100 troops, so the threshold is 1% of it; larger garrisons make it relatively tighter), and a wearing bonus of `floor((phase - 1) / 3)`. It has no terrain factor, so it is a flat-ground baseline: terrain multiplies the defender in every siege clash and will lengthen sieges a little. The TypeScript port includes terrain and the bands under Verification are re-checked with it. Every scenario has equal weight: besiegers-to-garrison ratio {1.2, 2, 4, 8, 20} × a relief army of {none, 0.5× the besiegers' strength}. The table below is the **uncapped** run, where the besiegers' physical troops equal their combat troops (physical multiple 1). The script also runs a **capped ×10** variant: physical troops ten times the logistics cap, combat troops `min(physical, cap)` with the cap equal to the starting combat strength, casualties charged to physical troops, and combat troops rebuilt from physical on every read.

**Rebuild rule.** Combat troops are never cached. They are recomputed from physical troops at the start of each phase and again immediately before every fight within the phase (sortie, assault, relief) and every ratio or desperation check, so a casualty applied earlier in the same phase is reflected on the next read. With a physical pool above the cap, attrition therefore leaves the fielded army unchanged until the pool falls under the cap, so desperation rarely triggers and the siege is slightly less likely to be lifted.

| Ratio at start | Median phases | p90 | p99 | Max | Falls | Mix of outcomes (%) |
| --- | --- | --- | --- | --- | --- | --- |
| 1.2 | 7 | 13 | 17 | 24 | 96-99% | starved out 79-81, surrendered 7-8, betrayed 8, relieved 0-3, stormed 1-2, lifted 1 |
| 2 | 4 | 8 | 11-12 | 16 | 91-94% | starved out 48-51, stormed 20-21, surrendered 18, lifted 6-7, betrayed 5, relieved 0-2 |
| 4 | 3 | 7 | 10 | 18 | 98-99% | starved out 44-45, surrendered 32, stormed 19, betrayed 3-4, lifted 1, relieved 0-1 |
| 8 | 3 | 6 | 9 | 14-15 | 99-100% | starved out 42-43, surrendered 38, stormed 16, betrayed 3, relieved 0-1 |
| 20 | 3 | 6 | 9 | 15-16 | 99-100% | starved out 42-43, surrendered 37-38, stormed 16-17, betrayed 3, relieved 0-1 |

Capped ×10 run (same seed and scenarios): median 3-7 phases, p90 6-11, p99 at most 15, maximum 21, falls 95-100%, `lifted` 0-4%, `relieved` 0-2%, betrayed 3-7%, stormed 15-18% from ratio 2 up and 4% at ratio 1.2. It stays inside the same bands as the uncapped run; the visible difference is slightly more storms and lifts at a thin edge and shorter tails, because attrition no longer erodes the fielded army.

Why the ratio matters: a thin edge (1.2) makes the siege slow and mostly ends by starving the garrison, while a large edge saturates at the top modifier and ends in about three months. Towns that are tiny compared with the besiegers therefore fall fast; large cities take longer, which is the point of sizing the garrison from urban population.

Falls are 91% or more because a siege only starts when the besiegers outnumber the garrison. The roughly 25% failure rate in Hundred Years' War sieges [S3] includes sieges the attacker was never strong enough to begin; here that failure shows up in open battles instead. `lifted` and `relieved` together stay at 1-10%.

#### Why this reads as narrative

A phase logs its dice beat (one at most; a stalemate is not logged), then possibly a sortie, an assault and a relief attempt, so a bad month can produce up to four entries (dice beat, sortie, assault, relief). A war's log can read: *siege began, disease swept the camp, a breach opened, the garrison starved, the gates were opened by a traitor*. A relieved or storm-lost siege is a clear turning point for the war. Chance keeps it from being a countdown, and shortages plus the wearing-down bonus keep it from running forever.

### Event flow

`runBattle` becomes: resolve target -> `BATTLE_KIND.choose` -> branch.

- non-siege kinds: unchanged flow, using the multipliers; the result carries `kind`.
- siege: `SIEGE.begin`, return.

`SIEGE` ticks run through `processEventsUntil` in `simulation/index.ts`, with their own `EVENT_HEAP.evt.SIEGE` type, next to `BATTLE`. They run inside the same `MILITARY.mutate` wrapper as `BATTLE`, so reconcile and the recruitment bookkeeping behave identically.

The siege tick lives in its own domain `events/siege` (`{index.ts, types.ts}`, namespace `SIEGE`). The conquest handling that `runBattle` does after a result is extracted into `CONQUEST.apply` and shared.

### Province data

- Add `riverByProvince: Uint8Array` to `HistoryState` (initialised from the existing `riverVisible` param in `state/index.ts`, near the water-access use at ~655). Add a `TERRAIN.hasRiver({ state, p })` helper beside `TERRAIN.battlefield` rather than reading the array from battle code.
- Urban size comes from `popUrbanCurrent` via `FIELDS.prov.population.urban`.

### Recording

- The `battle` event data (`record/types.ts`, `translator/index.ts`) gains `kind: BattleKind` and `ambusher: "attacker" | "defender" | "none"`.
- Siege events are pushed to `state.events` like `battle`. There is one tag per phase result, not one per beat:
  - `siege started`: `{ war, province, besieger, defender, besiegers, garrisonTroops }`.
  - `siege beat`: `{ war, province, beat, phase, besiegers, garrisonTroops, besiegerLosses, garrisonLosses }`.
  - `siege ended`: `{ war, province, outcome, reason, phases, besiegers, garrisonTroops, besiegerLosses, garrisonLosses }`, where `reason` is set only for `lifted`.
  - Stalemate phases push nothing.
  - All three tags also carry a deployment snapshot in the fields the `battle` event uses: `deployedNations`, `deployedTroops`, `deployedLevies`, `deployedRegulars`, `deployedRelations`, `deployedRoles`. Without it the war page's troop panel, which reads the latest battle's contributions, would show pre-siege numbers for the whole siege.
    - Meaning: **physical troops**, i.e. each side member's `war.deployed`, which is what `battle` events record today (`deploymentsOf` → `memberDeployments`). Not the logistics-scaled combat troops. Every panel snapshot uses this one quantity: mobilization, battles and siege events. Casualties are charged to physical troops, so a scaled figure would stay flat while a capped army bleeds.
    - Timing: each event's snapshot is taken immediately after that event's own losses are applied, not at the end of the phase. A phase with a dice beat, a sortie and an assault therefore records three successively smaller snapshots, and `siege ended` records the final one.
    - Helper: extract `MILITARY.deploymentData({ state, war, attackerSide })`, which builds both sides' members, runs the existing `deploymentsOf`, and returns the six fields. `attackerSide: WarSide` is required and sets the order: that side's members first, then the other side's, each with its lead first, which is how `fight` orders them today (`deployedRelations` marks each side's first member as the lead, so the order is part of the data). Three callers use it:
      - `runBattle`, in place of its inline block, passing the encounter attacker's side (`battle.attacker`'s side, which is the war's defender in a restoration battle); it must produce identical `battle` event fields.
      - the siege events, passing `siege.besiegerSide`.
      - `MILITARY.mobilize`, in place of its own block, passing `"attacker"` (its order today). **This is a deliberate change to the `war mobilized` event:** today it records logistics-scaled coalition troops, so a side with 10,000 deployed and a 1,000 cap shows 1,000 at the declaration and 10,000 after its first battle or siege, with no recruitment in between. After the change it records 10,000 from the start. The event's only readers are the translator (`war.mobilization`, used solely by the war panel) and a role assertion in `peace-outcomes.smoke.test.ts`; no simulation behaviour reads it.
  - Coalition sync: `SIEGE.begin` and `SIEGE.tick` call `MILITARY.logCoalition` before pushing their event, as `runBattle` does. In the translator, the journal coalition pairing (`translator/index.ts`, currently `note.tag === "war started" || note.tag === "battle"`) also accepts the three siege tags, and each siege branch calls `coalitionChange` like the `battle` branch. Otherwise a nation joining or leaving during a siege would not appear in `war.events` until the next field battle. A stalemate phase pushes no event, so a membership change in that phase is recorded with the next siege event; this delay is at most the gap to the next logged beat or the siege's end.

  | Narrative line | Trigger | `siege beat.beat` | Data beyond the common fields |
  | --- | --- | --- | --- |
  | A sortie from the gates (wording by result, below) | sortie attempted | `sortie` | fight fields; `effect`: `breach repaired`, `works burned` or `none` |
  | Fever spreads through the camp | roll 4-5 | `disease` | none; `besiegerLosses` carries the toll |
  | Supplies run low inside the walls | roll 10-11 | `supplies shortage` | none; `garrisonLosses` carries the toll |
  | Hunger sets in and the garrison thins | roll 12-13 | `food shortage` | same |
  | The wells turn foul | roll 14-15 | `water shortage` | same |
  | A breach opens | roll 16-17 | `breach` | `breaches` after this beat |
  | Men slip away from the garrison | roll 18-19 | `desertion` | `garrisonLosses` |
  | A traitor opens the gates | 1% chance per phase | `gates opened` | none; always followed by `siege ended` |
  | The besiegers storm the walls (wording by result, below) | assault attempted | `assault` | fight fields; `effect`: `stormed`, `repelled` or `none` |
  | A relief army marches (wording by result, below) | relief attempted | `relief` | fight fields; `effect`: `relieved` or `none` |
  | The garrison surrenders | roll ≥ 20 | `surrender` | none; always followed by `siege ended` |

  Fight fields, on `sortie`, `assault` and `relief` beats only: `won` (whether the acting side won the clash: the garrison party for a sortie, the besiegers for an assault, the relief force for relief), `outcome` (the clash's `BattleOutcome`), `powerShare`, and `effect`. These replace separate `sortieWon` / `assaultWon` / `reliefWon` flags. `effect` is what the simulation actually did, so the text never has to infer it from `won`: an inconclusive win has `won: true` and `effect: "none"`, and an assault that destroys the garrison has `effect: "stormed"` whatever its `won` and `outcome`. Assault `effect` is assigned in this order: garrison destroyed → `stormed`; else a win that is not `inconclusive` → `stormed`; else a loss → `repelled`; else `none`. The same order decides the siege's result in step 8, so a lost or inconclusive assault that still wipes out the garrison takes the town and does not lift the siege.

  | Beat | `effect` | `won` | Text |
  | --- | --- | --- | --- |
  | sortie | `breach repaired` | true | A sortie from the gates drives the besiegers back and a breach is sealed |
  | sortie | `works burned` | true | A sortie from the gates burns the siege works |
  | sortie | `none` | true (inconclusive) | A sortie from the gates is fought to a standstill |
  | sortie | `none` | false | A sortie from the gates is cut down |
  | assault | `stormed` | true, not inconclusive | The besiegers storm the walls and break in |
  | assault | `stormed` | any other (garrison destroyed) | The garrison is cut down to the last man in the assault and the town falls |
  | assault | `none` | true (inconclusive) | The besiegers storm the walls but cannot break in |
  | assault | `repelled` | false | The besiegers' assault is thrown back |
  | relief | `relieved` | true | A relief army breaks the siege lines |
  | relief | `none` | true (inconclusive) | A relief army reaches the lines but cannot break them |
  | relief | `none` | false | A relief army is beaten off |

  `siege ended.outcome` follows the precedence table under Outcomes: the garrison falling after a shortage reads `starved out`, a fall with no shortage reads `surrendered`, and so on. A recorded `surrender` beat can therefore end as either, by the state of `shortages`, not by the last beat.
- Shortages are one of each per siege: a roll that repeats a shortage already suffered is treated as a stalemate, so the log never shows the same shortage twice and caps shortages at three.
- Record shape (`record/types.ts`): `WarRecord` gains `sieges: SiegeRecord[]`, each `{ timeMs, province, besieger, defender, besiegers, garrisonTroops, contributions: BattleContribution[], beats: SiegeBeat[], outcome: SiegeOutcome | null, reason: SiegeLiftReason | null, endTimeMs: number | null, endContributions: BattleContribution[] | null, phases: number | null }`. `phases` is copied from `siege ended.phases`, the number of phases the siege completed (its `phase` counter when `SIEGE.end` runs). It cannot be rebuilt from `beats`, because stalemate phases log none, and a siege ended by peace between ticks has completed fewer phases than its calendar length suggests. Invariant: a **running** siege (the state for one active when recording stops) has `outcome`, `endTimeMs`, `endContributions` and `phases` all `null`; a **finished** siege has all four set (`phases` may be 0). `reason` is non-null only when `outcome` is `lifted`, so it is `null` for running sieges and for every finished siege that was not lifted. The UI tests "finished" by `outcome !== null`, never by `reason`. The translator builds it from the three tags in order, in `translator/index.ts` beside the `battle` branch. Each `SiegeBeat` is `{ timeMs, phase, beat, besiegerLosses, garrisonLosses, contributions: BattleContribution[] }` plus the beat-specific fields above. Every `contributions` list is built by the translator's existing `contributions` helper from the event's deployment snapshot. `Battle.simulated` (`SimulatedBattle`) gains `kind: BattleKind` and `ambusher`, so recorded Earth battles, whose `simulated` is `null`, need no kind; the Earth record builder (`record/index.ts`) sets `sieges: []` on every war. A siege's fights (`sortie`, `assault`, `relief`) are not also written as `battle` records.
- UI (follow `src/ui/components/UI.md`; keep this a small final step). Nothing renders kinds or sieges today: both timelines loop over `war.battles` only.
  - Battle kind: extend `battleDetail` in `src/ui/genesis/wiki-bridge/nation-wiki-timeline-format.ts` to add a clause for `ambush` (naming the ambushing side) and `river crossing`; `open` adds nothing. Both the war page and the nation page call it, so no other change is needed for kinds.
  - Siege timeline: new submodule `src/ui/genesis/wiki-bridge/siege-timeline/{index.ts,types.ts}` (namespace `SIEGE_TIMELINE`, modelled on `raid-timeline`: it takes the same `nationNameOf` and `provinceName` resolvers). `SIEGE_TIMELINE.build` turns one war's `sieges` into timeline entries: one for the start, one per beat using the texts above, and one for the end with the outcome, the lift reason and the duration. A siege with a `null` outcome produces no end entry.
    - Duration: the end entry shows elapsed calendar time, `endTimeMs − timeMs`, as whole months of `SIEGE_PHASE_DAYS` (30) days ("after 7 months"), or in days when under one month. Calendar time is right for a reader and is correct when peace ends the siege between ticks. The recorded `phases` is not displayed; it feeds the siege-duration report.
    - Viewpoint: it takes `viewpoint: number | null` (`null`, not an optional attribute). The nation page passes its nation to filter to sieges where it is the besieger or defender and to mark the end `Siege (+)` or `Siege (-)`; the war page passes `null` and gets plain `Siege`.
    - Description: the timeline renderer only links a mention whose name appears verbatim in the description, so every entry's text contains the besieged province's name and both nations' names exactly as `provinceName` and `nationNameOf` return them. Templates: start, "B laid siege to X, held by D."; beat, "At B's siege of X, held by D: <beat text>."; fall, "B took X from D after <duration>: <outcome>."; other endings, "B's siege of X, held by D, ended after <duration>: <outcome and lift reason>.". With a viewpoint the war name is appended in parentheses, as the nation page's battle lines do, since that page mixes several wars.
    - Ids: `siege:<war id>:<siege index in war.sieges>:start`, `...:beat:<beat index>` and `...:end`. Two sieges of the same province in one war, or several beats on one date, stay unique.
    - Mentions: each entry returns `besiegerId`, `defenderId`, `provinceId` and `warId`. The hooks turn these into the timeline's clickable mentions with their existing `nationMention`, `provinceMention` and `warMention` helpers: nations and province on both pages, the war on the nation page (the raid builder has no war field, so this is new relative to it).
  - Callers: `useWarWikiData.tsx` beside the `war.battles` loop, and `useNationWikiData.tsx` beside the `RAID_TIMELINE.build` call. No sentence-building in the hooks.
  - Colour: add `siege: "#7f1d1d"` to `uiPalette` in `src/ui/components/tokens.ts`, beside the existing `war: "#b91c1c"` (Tailwind red-900 against war's red-700: same family as the fighting, darker). `timelineTypeColor` in `src/ui/wiki/nation/timeline-formatting.ts` returns `uiPalette.siege` for `Siege`; no hex literal is added to the formatter, per `UI.md`. The `Siege` label carries the distinction, so nothing depends on the colour alone. Also add `Siege` to `TIMELINE_TYPE_ORDER` with rank 3, the rank `War` and `Battle` already share, so same-day siege entries sort with the fighting and before `Territory`.
  - Troop panel: `useWarWikiData.tsx` picks `latestBattle` with a strict `>` on time and reads its contributions. Replace that with one ordered list of snapshots for the war: every battle, and for every siege its start, each beat and its end. Order by `timeMs`, ties broken by recording order (within a siege: start, beats in array order, end; a battle before a siege entry at the same time). The panel uses the **last** snapshot at or before the cutoff, so when a phase logs several events at one timestamp the final one wins and the ending beats the beats before it. Keeping the strict `>` would keep the first and miss the later losses.
  - Snapshot lag: a snapshot is only as fresh as the last logged event. Stalemate phases log nothing, so recruitment, allocation and membership changes in them (not only the 1% attrition) are invisible until the next logged beat. This is the same kind of lag the panel already has between battles (up to 10 months). Show it rather than hide it with a new `troopsAsOf: string` on `WarWikiData`: the chosen snapshot's date (the war's start date when the snapshot is the mobilization), rendered beside the side troop totals as "troops as of <date>". It is separate from the existing `participantsAsOf`, which labels the whole panel with the date its **membership** is shown for and keeps its current meaning and placement; the member list stays current while the troop figures carry their own, possibly older, date.
  - Empty snapshot: a siege event's contributions can legitimately be empty or omit a member (both sides emptied, a nation left, the siege was invalidated). The chosen snapshot is used as it is: members missing from it show no troop count and a side with none shows no total. The panel never falls back to an earlier snapshot for them.

## Constants and sources

Every constant used by this plan, with its value and where it comes from. "Anchor" means a cited source constrains the value; "calibrated" means the value was chosen so the simulated distribution lands in the target bands under Calibration result; "given" means the user specified it.

Kind selection and advantage (`BATTLE_KIND`, in `events/battle/kind`):

| Constant | Value | Basis |
| --- | --- | --- |
| weight `open` | 0.70 | given: open battles carry the most weight |
| weight `ambush` | 0.05 | given: small chance; 5% keeps ambush at 5-7% of battles after normalising |
| `AMBUSH_DEFENDER_SHARE` | 0.60 | given: slightly higher chance for defenders |
| weight `river crossing` | 0.12 | given: moderate; river provinces only |
| weight `siege` | 0.15 | given: moderate; town or city provinces only |
| `AMBUSH_BONUS` | 1.3 | anchor: CK3 advantage tops out near +30 [S7]; at `BATTLE_EXPONENT` 3 and equal forces the ambusher wins 1.3³ / (1 + 1.3³) = 69% |
| `RIVER_CROSSING_BONUS` | 1.2 | anchor: CK3 river/strait defender advantage +10 to +30 [S7], middle of the range; defender wins 63% at equal force. Same value as the existing `DEFENDER_BONUS` (1.2) |
| `TOWN_URBAN_POPULATION` | 5,000 | anchor: the sim's own development table steps at 5,000 urban residents [S10]; matches the usual 5,000 minimum for historical city datasets (Bairoch), which I have not verified against the source |

Siege (`SIEGE`, in `events/siege`):

| Constant | Value | Basis |
| --- | --- | --- |
| `SIEGE_PHASE_DAYS` | 30 | anchor: EU5 sieges advance in 30-day phases [S8]; CK3 and EU4 are day-based and were scaled to it |
| garrison size rate | the defender's `levyEligibility` (0.02; 0.05 tribal) | anchor: the sim's own levy eligibility (`docs/terrestrial/politics/armies-and-wars.md`, `recruitment/index.ts`), read from the recruitment code rather than hardcoded. A modelling shortcut: the rate is a levy figure but sizes a mixed garrison, since regulars are sized by funding, not population. A 5,000-person town holds 100 men, a 100,000-person city 2,000; Kenilworth held about 1,200 in a castle for 172 days [S2] |
| `SIEGE_GARRISON_FIELD_CAP` | 0.5 of the defending coalition's deployed troops | calibrated: a siege cannot strip the whole field army into one town, so at least half stays outside and can relieve |
| `SIEGE_ATTRITION_MONTHLY` | 0.01 | anchor: CK3 besiegers lose 1% of army strength per month [S7] |
| `SIEGE_ABANDON_SHARE` | 0.75 | calibrated: besiegers at `R` below 0.75 can no longer invest the town; the start rule is `R` > 1, so this adds a margin before they give up |
| `SIEGE_GATES_CHANCE` | 0.01 per phase | calibrated: gives 3-8% of sieges ending in betrayal (more in long sieges); rare by design |
| `SIEGE_WEARING_PHASES` | 2 | calibrated against the production loop in `src/test/history-run/siege.smoke.test.ts`: 3 gave median 8 at ratio 1.2, outside the required band; 2 gives median 3-7, p99 8-15 and maximum 23 across 64 scenarios of 20,000 runs each |
| `SIEGE_MAX_PHASES` | 48 | guard only; never reached in calibration (maximum 24 phases) |
| `SIEGE_GARRISON_DESTROYED` | 1 troop | below one troop the garrison is gone |
| ratio modifier | -2 below 1.25; 0 to 2; +1 to 3; +2 to 6; +3 from 6 | calibrated: a thin edge over the garrison makes a quick fall unlikely and a bled army likely to give up; EU5 uses signed dice modifiers the same way [S8]; the +3 band keeps large edges from saturating at +2 |
| per breach | +2 | anchor: EU5 breaches add +2 to the siege dice [S8] |
| per shortage | +1 | calibrated, in the same spirit as EU5's shortage results |
| roll bands | see the table in Siege (rolls ≤ 3 and 6-9 are a stalemate) | shape from EU5's result table [S8] (disease, shortages, desertion, surrender), widened to a d20 |
| `SORTIE_PARTY_SHARE` | 0.20 | calibrated: a sortie is a raid, not the whole garrison |
| `SORTIE_MAX_RATIO` | 3 on `R` | calibrated: a garrison does not sally against odds of three to one or worse (a sortie loses about 93% of the time at R = 3 in a flat-ground simulation) |
| `SORTIE_BASE_CHANCE` | 0.10 per phase | calibrated: occasional raids in any siege that is still close |
| `SORTIE_PER_BREACH` | 0.10 per breach | calibrated: a breach is what a sortie can undo, so it makes one likelier |
| `SORTIE_CAP` | 0.4 | calibrated: even a heavily breached garrison does not sally every phase |
| `SORTIE_DISRUPTION` | 0.03 of besiegers | calibrated: the garrison's counterplay to a breach; when no breach exists, a won sortie burns works and stores worth a few percent of the camp. Changes no calibration band (sorties are rare and mostly lost) |
| sortie advantage | `AMBUSH_BONUS` (1.3) | reuse: the garrison hits the camp by surprise, which is an ambush; no separate sortie constant |
| `DISEASE_LOSS` | 0.04 of besiegers | calibrated, cross-checked against: Ladysmith's 120-day siege recorded 1,280 typhoid and 1,841 dysentery cases [S6]; crusade-length campaigns lose roughly 15-20% to disease over two or three years, a floor for a camp [S9] |
| `SHORTAGE_LOSS` | supplies 0.03, food 0.05, water 0.05 | calibrated: Kenilworth's garrison surrendered weakened by dysentery with two days of food left [S2]; food and water bite harder than supplies |
| `BREACH_GARRISON_LOSS` | 0.02 | calibrated: a breach costs defenders men but is mostly a morale and defence event |
| `DESERTION_LOSS` | 0.10 | calibrated: Hundred Years' War sieges sometimes ended with the garrison's flight [S3] |
| `ASSAULT_MIN_RATIO` | 1.5 | calibrated: besiegers do not storm without a clear numerical edge; assaults are avoided because they are costly [S4] |
| assault chance | 0.3 per breach, +0.5 when desperate, cap 0.9 | calibrated: gives 16-21% of sieges ending in a storm when the besiegers have at least a 2:1 edge (1-2% when the edge is thin), matching "a substantial minority" [S3] |
| `SIEGE_DESPERATION` | 0.15 | calibrated: besiegers who have lost 15% of their starting strength risk an assault rather than waiting |
| `ASSAULT_WALL_BONUS` | 1.5, minus 0.15 per breach, floor 1.0 | anchor: assaults on intact works cost the besiegers far more than the defenders (Fribourg 1744: roughly 700 French dead against 20 garrison dead [S4]); at 1.5× the besiegers' own strength the fight is even, so a storm at the minimum ratio is a coin flip |
| `RELIEF_CHANCE` | 0.06 per phase | calibrated: gives 0-3% of sieges relieved in the scenarios that have a relief army (none in the others); relief is the unusual ending [S1] |
| `RELIEF_MIN_RATIO` | 0.25 | calibrated: a relief force (deployed troops outside the garrison) under a quarter of the besiegers' strength cannot attempt relief |
| `STORM_URBAN_LOSS` | 0.10 of urban population | calibrated: a stormed town is sacked, but most residents survive; the great massacres are the tail, not the norm [S4] |

All siege percentages apply to the current troop count unless a row says "starting". Garrison percentages apply to the whole garrison map; besieger percentages to the besiegers' combat troops (the logistics-scaled forces described above), charged to physical troops.

## Sources

- [S1] Medieval siege duration and endings: [English Heritage, Medieval siege warfare](https://www.english-heritage.org.uk/learn/story-of-england/medieval/siege-warfare/); [Medieval Sieges](https://www.medievalchronicles.com/medieval-battles-wars/medieval-warfare/10-surprising-things-about-sieges-unveiling-the-tactics-and-realities-of-medieval-warfare/). Most castle sieges in Britain rarely lasted more than two months; relief is an unusual ending. These pages were read through search summaries, not in full.
- [S2] [Siege of Kenilworth](https://en.wikipedia.org/wiki/Siege_of_Kenilworth): 172 days, a garrison of about 1,200, dysentery, two days of food left at the surrender.
- [S3] [Investigating the Outcome of Sieges During the Era of the Hundred Years' War: A Quantitative Reconnaissance](https://www.academia.edu/101238391/Investigating_the_Outcome_of_Sieges_During_the_Era_of_the_Hundred_Years_War_A_Quantitative_Reconnaissance): about 900 sieges, successful sieges outnumber failures 3:1, surrender on terms just under half, a substantial minority taken by assault, some by flight of the garrison. The page could not be fetched (HTTP 403); these figures are from search summaries.
- [S4] [Siege of Fribourg (1744)](https://en.wikipedia.org/wiki/Siege_of_Fribourg_(1744)) for assault casualties; Clonmel (1650), where Cromwell lost about 2,000 in one attack, per the same search; [Siege](https://en.wikipedia.org/wiki/Siege) on assaults being avoided.
- [S5] Durations of Vauban-era sieges: [Siege of Ath (1697)](https://en.wikipedia.org/wiki/Siege_of_Ath_(1697)) about three weeks; [Namur (1692)](https://en.wikipedia.org/wiki/Siege_of_Namur_(1692)) 36 days; [Landau (1704)](https://en.wikipedia.org/wiki/Siege_of_Landau_(1704)) 77 days. Also the convention that a commander may honourably surrender after a breach and one repulsed assault ([Vauban](https://en.wikipedia.org/wiki/S%C3%A9bastien_Le_Prestre,_Marquis_of_Vauban)); this plan does not model that convention.
- [S6] [War and Disease II, Russo-Japanese and South African campaigns](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5228997/): Ladysmith, 120 days.
- [S7] [CK3 Warfare](https://ck3.paradoxwikis.com/Warfare#Siege): 1% monthly besieger attrition; terrain advantage +10 to +30.
- [S8] [EU5 Combat#Sieges](https://eu5.paradoxwikis.com/Combat#Sieges) and [EU4 Land warfare#Sieges](https://eu4.paradoxwikis.com/Land_warfare#Sieges): 30-day phases, dice results (disease, shortages, desertion, surrender), +2 per breach, assaults.
- [S9] [Disease helped decide the Crusades](https://healthchecksonhistory.substack.com/p/disease-decided-the-crusades) and the [Siege of Acre (1189-1191)](https://en.wikipedia.org/wiki/Siege_of_Acre_(1189%E2%80%931191)): disease hollowed out the army; a share of a long crusade dies of disease.
- [S10] `docs/terrestrial/population/growth-cities-and-knowledge.md`: development table steps at 1,000 / 5,000 / 20,000 urban residents.

Where a source was only read via a search summary, the note says so. Anything marked "calibrated" is a modelling choice, not a measured historical value.

## Module layout

```
events/battle/
  index.ts          runBattle (dispatch + non-siege flow), BATTLE
  types.ts
  kind/
    index.ts        BATTLE_KIND.choose / modifiers
    types.ts        BattleKind, ChooseParams, ModifiersParams
  conquest/
    index.ts        CONQUEST.apply (occupation, plunder, peace checks, next battle)
    types.ts
events/siege/
  index.ts          SIEGE.begin / tick / end
  types.ts          Siege, Shortage, tick params
military/
  index.ts          clash, casualties, applyTroopLosses (new); coalition gains `excluded`; fight and applyLosses rebuilt on them
```

`CONQUEST.apply` is the block of `runBattle` that applies a result: occupation, plunder, the peace checks and queuing the next `BATTLE` event. Check `events/war` and `events/peace` for existing occupation code first and reuse it instead of duplicating it.

Constants (weights, bonuses, siege rates) are file-level constants in the module that uses them, matching `military/index.ts`.

## Implementation steps

1. Baseline (per `AGENTS.md`, History benchmark baselines). The required baseline is the latest completed detailed `pnpm report:history` report in `stats/history/`, reused rather than re-run: `stats/history/2026-10-03T00-12-28-000Z-history-pipeline-merged/100.json` (`run.json`: title `history-pipeline-merged`, revision `1c8068b`, report SHA-256 `bacaf9d0413a84b55cf5d362ea6a14ed59d427c54b4463d645eeee67ba2c5d42`). Its configuration, from the report's diagnostics: seed `14963991`, era `lateMedieval`, requested points `204000` (generated 204,001; 12,746 provinces), years 867 to 967 (`HISTORY_START` 867, `HISTORY_YEARS` 100), late-knowledge band `2.366478320318625` (`HISTORY_LATE_KNOWLEDGE`). Before using it, confirm from the report that it is a `report:history` report (the folder title says "pipeline" and `run.json` records no command) and read its diagnostic and profiling settings, which `run.json` does not list. If either check fails there is no applicable baseline, and the first step is to run `pnpm report:history` at the current revision and save it. The older `2026-10-01T11-40-00-000Z-original-history-baseline/933.json` (revision `78f34d5`, 933 years) is not applicable: it predates the current code and covers a different horizon.
   Also record, for that baseline's world, how many provinces meet `TOWN_URBAN_POPULATION` (5,000) and the spread of the besiegers-to-garrison ratio the new garrison rule would give. Re-run `plans/history-battle-types-calibration.py` with that spread and adjust constants only if the bands under Verification fail.
2. Add `riverByProvince` to state and `TERRAIN.hasRiver`.
3. Split `MILITARY.fight` into the pure `clash` and the state-applying `fight`, replacing `defense` with the two multipliers. With only `open` behaviour, battle results must match baseline exactly.
4. Add `BATTLE_KIND` with `open`, `ambush` and `river crossing`, the weighted draw, and `kind` and `ambusher` in the battle event and translator.
5. Extract `CONQUEST.apply` from `runBattle`.
6. Add `War.siege`, `EVENT_HEAP.evt.SIEGE`, the `SIEGE` module and the siege branch in `runBattle`. Audit every caller of `resolveWar` and route every war-ending path through `SIEGE.end`.
7. Record siege events (with the deployment snapshot and coalition sync) and the war record shape, then the UI listed under Recording: `battleDetail`, `SIEGE_TIMELINE`, the `Siege` timeline type, and the troop panel source.
8. Port the calibration script to a seeded TypeScript test, delete it from `plans/`, and tune at the verification gate.
9. After implementation, run `pnpm report:history` with the baseline's seeds, era, point count, starting year, duration, knowledge-band threshold and diagnostic/profiling settings, set through `HISTORY_SEEDS`, `HISTORY_ERA`, `HISTORY_POINTS`, `HISTORY_START`, `HISTORY_YEARS` and `HISTORY_LATE_KNOWLEDGE`, with `HISTORY_TITLE` set to `battle-types` and `HISTORY_OUT` unset. Save the report and a comparison to `stats/history/<UTC start timestamp>-battle-types/` and commit them with the implementation. Compare simulation statistics separately from timing and memory, and explain intentional behaviour changes (longer wars from sieges, shifted occupation timing) and any regressions.

## Verification

- `pnpm lint` and `pnpm typecheck` after each TypeScript step.
- Extend `src/test/history-run/battle-revamp.smoke.test.ts` and add `siege.smoke.test.ts` under `src/test/history-run/`.

Random runs assert bands, not occurrence of rare events:

- Kind mix on the 204k procedural planet (`HISTORY_POINTS=204000`): open is the plurality; ambush is 3-9% of battles; river crossing only appears on river provinces; siege only on provinces at or above the town threshold with a garrison the besiegers outnumber.
- Ambush on neutral terrain (`terrain.defense` 1.0): the ambusher wins 60-75% at equal force, whichever side it is (1.3³ / (1 + 1.3³) = 69%). Defenders ambush more often than attackers. Stacking is checked separately on defended terrain: at `terrain.defense` 1.35 an attacker ambusher wins about 47% and a defender ambusher about 84% (1.3 × 1.35). River crossing: the defender's win rate is above open's at equal force, and on hills the multiplier is `(1 + hill) × 1.2`, not a replacement for terrain.
- Seeded siege calibration, per scenario (ratio {1.2, 2, 4, 8, 20} × relief {none, 0.5×} × physical multiple {1, 10}, so both uncapped and above-the-cap armies, seed 2025, 20,000 runs; combat troops rebuilt from physical on every read):
  - median phases between 3 and 7, p99 at most 17, maximum at most 30, no siege reaches the 48-phase cap;
  - falls at least 90% of the time; `lifted` plus `relieved` at most 10%;
  - betrayed at most 9%; for ratio 2 and above, stormed 10-25%.
- On sim sieges: no siege outlives its war, `war.siege` is `null` for every ended war, every `siege started` has a matching `siege ended` unless the war was still active when recording stopped (those records carry `null` outcome and end time), besiegers lose troops every phase, and `MILITARY.validate` still passes (no negative troops, deployed within holdings).

Deterministic tests drive rare beats and endings with a scripted `rng`, one per case, so they do not depend on luck:

- each dice beat (disease, each shortage kind, breach, desertion, surrender, and stalemate on rolls of 3 or less) and its exact effect, with the sortie tested separately through its own trigger;
- a repeated shortage kind is a stalemate;
- gates opened; garrison destroyed with and without a prior shortage (`starved out` vs `surrendered`);
- assault: win, loss, inconclusive-win (siege continues), garrison destroyed in the assault;
- relief win, relief loss, no relief when the field army is below the minimum;
- restoration siege: the war's defender is the besieger and the outcomes apply correctly;
- peace or sovereignty change mid-siege: the siege ends with `lifted` and reason `war ended` or `invalid`, before `war.siege` is cleared;
- allocation, membership or recruitment changes mid-siege: the besiegers' and garrison's troops stay within `war.deployed`;
- a sortie's losses stay within the 20% party and are not applied to whole armies;
- sortie reachability: with `R` below 3 and a breach present, the sortie chance is above the base chance (capped at 0.4), and with `R` of 3 or more no sortie is attempted;
- casualty ownership: after recruitment changes a nation's deployed levy/regular mix, garrison losses follow the garrison's own mix, reduce both `siege.garrison` and `war.deployed` by the same per-type amounts, and relief and besieger losses never reduce the garrison;
- an empty garrison after reconciliation, and both sides empty, resolve at step 3 before `R` is computed, with no division by zero and no gates roll;
- logistics: with deployments far above the logistics cap, the besiegers, the relief force and the ratio use the capped combat troops, the garrison is sized from physical troops, and a defender with 10,000 deployed, a cap of 1,000 and a 100-man garrison fields a 1,000-troop relief force;
- war ended during a siege: calling `PEACE.conclude` on a besieged war pushes exactly one `siege ended` (`lifted`, `war ended`), clears `war.siege`, and by itself adds no `BATTLE` or `SIEGE` event to the heap, changes no occupation and takes no plunder on the siege's account (heap contents compared before and after the call);
- stale tick: peace between ticks, then processing the already queued `SIEGE` event, produces no second `siege ended`, no casualties, no occupation, no new battle, and consumes no randomness;
- besieger casualties reduce holdings, casualty totals and rural population like any other casualty, and are not restored by recruitment or allocation;
- `clash` with shortfalls reproduces today's `fight` results for an `open` battle exactly (fixed seed, rout and shortfall cases included).

Recording and UI checks:

- translator: a nation that joins or leaves a war in a phase that logs a siege event appears in `war.events` at that event's time, not at the next battle;
- translator: every `siege started`, `siege beat` and `siege ended` yields a `contributions` list that equals the physical `war.deployed` troops of the war's current side members immediately after that event's losses, which may be an empty list; in a phase with a dice beat, a sortie and an assault, the three lists differ and decrease in that order;
- `war mobilized` for a side deployed above its logistics cap records `war.deployed`, not the capped figure, and equals the first battle's or first siege event's snapshot apart from that event's own losses;
- `phases` on a finished record equals the completed phase count: a siege that runs two stalemates and then falls has `phases` 3 and one beat; a siege ended by peace before its first tick has `phases` 0;
- `battle` events built through `MILITARY.deploymentData` carry the same six `deployed*` fields, in the same order, as before the extraction, checked for a normal battle and for a restoration battle (war's defender attacking): nations, troops, levies, regulars, relations and roles all list the encounter attacker's side first, with the lead's relation `-1` at the head of each side;
- a restoration siege's events list the besieging side (the war's defender) first;
- record invariant: a running siege has `null` outcome, end time, end contributions and phases; a finished siege has all four; `reason` is non-null exactly when the outcome is `lifted`;
- `SIEGE_TIMELINE.build`, deterministic, on hand-built records:
  - one start entry, one entry per beat and one end entry per finished siege; a running siege has no end entry, and a finished non-lifted siege (null `reason`) does have one;
  - with a viewpoint nation, only that nation's sieges appear and the end is `(+)` for the side that got its way (a fall for the besieger, `relieved` or `lifted` for the defender);
  - each row of the fight wording table produces its text, including the three inconclusive wins, a sortie with `breach repaired` versus `works burned`, and an assault with `effect: "stormed"` on a lost clash and on an inconclusive win (garrison destroyed), which reads as the town falling;
  - the end entry's duration is the elapsed calendar time: 210 days reads "7 months", 12 days reads "12 days";
  - ids are unique across two sieges of the same province in one war and across several beats on one date;
  - every entry's description contains the province name and both nation names exactly as the resolvers returned them, carries besieger, defender and province ids, and with a viewpoint also the war id and the war name in the text;
- troop panel selection, deterministic: for a phase whose dice beat, assault and `siege ended` share one timestamp, the panel at that time shows the ending's contributions; one day earlier it shows the previous snapshot; `troopsAsOf` is the chosen snapshot's date while `participantsAsOf` is unchanged from today's behaviour; when the chosen snapshot is empty, the panel shows no troop counts instead of the previous snapshot's;
- siege engine, deterministic: an assault that loses the clash but leaves the garrison under 1 troop ends the siege as `stormed`, not `lifted`;
- in the running app: a war page with a siege shows the siege entries among the battles, the province and nation mentions in a siege entry navigate when clicked, the war mention does on the nation page, and the troop panel changes when the selected date moves across a logged beat.

Report additions in `src/test/history-run/report/military` for kind counts, siege duration, and siege outcomes. The after-change comparison is step 9 against the named baseline (one seed, 100 years); sieges lengthen wars, so large shifts in war length, occupation counts or peace timing should be reviewed deliberately, not tuned away blindly.

## Decisions to confirm

- One active siege per war in the first model. A war that wants a second front waits for the first to resolve. Lifting the limit means `War.sieges` as a list.
- An inconclusive assault win is not a storm unless it destroys the garrison: otherwise both sides keep their losses and the siege continues, matching the existing battle rule that `inconclusive` wins make no progress.
- Ambush bias of 0.6 toward the defender is a starting value, not derived from data.
- The garrison is sized with the defender's levy eligibility rate even though it holds levies and regulars; regulars are funded, not population-sized, so this is a shortcut.

## Out of scope

- Naval and amphibious battles, supply lines, commanders and leader traits, sieges of non-target provinces, and winter/season effects.
- The Vauban convention of honourable surrender after a breach and one repulsed assault.
- Backwards compatibility for old recorded battle events: `kind` is required on new records.

## Implementation completed

- Final equivalent report: `stats/history/2026-10-03T13-52-03-688Z-battle-types/100.json`; comparison: `100-diff.html`; interpretation and calibration artifacts: `README.md`, `calibration.json`, `python-calibration.txt`. The earlier implementation report at `stats/history/2026-10-03T13-29-36-150Z-battle-types/100.json` is preserved.
- Baseline verified as a detailed history report by its military metrics, recruitment diagnostics, annual ticks, snapshots and completed 867-967 horizon. Its older metadata lacks an explicit completion flag. Both reports use seed 14963991, lateMedieval, 204000 requested points, start 867, duration 100, late knowledge 2.366478320318625, standard detailed diagnostics and no profiling. `HISTORY_BASELINE` selects the exact baseline above; `HISTORY_OUT` is unset.
- Initial world: 750 town provinces, 1,217 river provinces and 144 eligible siege targets. The ratio spread is included in production calibration.
- Final checks: `pnpm lint`, `pnpm typecheck`; 60 battle/siege/timeline tests, 56 peace/recruitment/deployment/breakaway tests, siege translator and recruitment-record tests, and the completed `pnpm report:history`. Lifecycle diagnostics and annual `MILITARY.validate` pass.
- Browser verification rendered the production war page and timeline components with siege fixture records. Phase selection changed troop counts and displayed the snapshot date; nation, province and war mentions navigated. Screenshot inspected. This was a component fixture check, not a generated-world browser session.
- Shared troop accounting and conquest logic are reused. Siege troop preparation/accounting live in `events/siege/troops/{index.ts,types.ts}`; timeline and snapshot selection each have their own modules. Running and completed records, restoration encounters, coalition changes, stale ticks and peace closure are tested.

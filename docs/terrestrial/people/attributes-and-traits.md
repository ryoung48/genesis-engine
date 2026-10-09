# Person attributes and traits

Scope: `:history`.

Attributes, personality and inherited traits describe the same [simulated people](overview.md). They influence family and political outcomes; `CHARACTER` is the code API for reading those properties.

People have six base attributes, three personality traits, three congenital ladders and seventeen congenital traits. Fifteen traits use carried-gene inheritance; Inbred and Pure-blooded use parental relatedness and active inheritance. The table stores five packed innate columns. Pure helpers decode the columns; records preserve the innate data for queries at a selected date. "Hook" is reserved for the Crusader Kings III mechanic of that name (a claim one character holds over another) and is not used here; what archived plans and saved reports call a hook is an *effect* in this document, as listed in the glossary of `plans/archive/people-1b-rename-hooks.md`.

Code: `sim/people/attributes`, `traits`, `character`; `sim/engine/governor`, and `events/battle/command`; `record/people/query`; `test/history-run/report/people-traits`, all under `src/model/history` except the report.

## Deterministic birth rolls and re-parenting

`HASH.unit({seed,channel,salt})` uses MurmurHash3 fmix32 over `seed ^ imul(channel,0x9e3779b9) ^ imul(salt,0x85ebca77)`, divided by 2^32. Birth salt is zero. The person's name seed and parent character determine every innate value. These rolls consume no shared simulation randomness.

When royal marriage initialization changes a queen's parents and name seed, `PEOPLE.redraw` redraws her and every descendant in birth order. Existing births and dates stand; only character is recalculated. Her starting children were conceived with provisional fertility, an accepted limitation until starting-family backfill is implemented. No governor is rehomed during initialization.

Packing: `bases` uses six four-bit values; `personality` uses three six-bit codes; `grades` uses seven bits per ladder (active grade plus three, carried good tier, carried bad tier); `congenital` and `carried` are seventeen-bit active and fifteen-bit carried sets. `CHARACTER.of` reads a person's packed values for pure helpers.

## Attributes and personality

**Base attributes** (six integer columns, 0–10).

- No known parent: `floor(11u)`.
- Otherwise `clamp(round(5 + 0.5 × (mid − 5) + (2u − 1) × 5.1), 0, 10)`, where `mid` is the parents' mean base and an unknown parent counts as 5.

**Personality** (three columns). All 36 CK3 personality traits, in 17 groups of opposites: 15 pairs and 2 triples. Three distinct groups are chosen by hash. Every trait has weight 1 except Eccentric, which has 0.05. Within a group each member has share `s = weight / group weight` (1/2 in a pair, 1/3 in the Compassionate triple; 48.8%, 48.8% and 2.4% for Stubborn, Fickle and Eccentric), except that when exactly one member appears among the parents that member has chance `s + 0.4 × (1 − s)` (0.7 in a pair) and the rest share the remainder in proportion to their weights. The traits become active at ages 9, 11 and 13.

Each row below is one group. "Other" lists the non-skill values that have an effect here: income, war chance, fertility, health, role-scoped opinion (DP10) and attraction. Opinion entries distinguish general reputation from vassal-only effects; carried/inactive traits contribute nothing.

| Trait | Dip | Mar | Stw | Int | Lrn | Prw | Other |
|---|---|---|---|---|---|---|---|
| Brave | | +2 | | | | +3 | attraction +10 |
| Craven | | −2 | | +2 | | −3 | attraction −10 |
| Ambitious | +1 | +1 | +1 | +1 | +1 | +1 | war chance +1 |
| Content | | | | −1 | +2 | | war chance −0.25 |
| Wrathful | −1 | +3 | | −1 | | | war chance +0.25 |
| Calm | +1 | | | +1 | | | war chance −0.25 |
| Just | | | +2 | −3 | +1 | | |
| Arbitrary | | | −2 | +3 | −1 | | opinion −5 |
| Diligent | +2 | | +3 | | +3 | | |
| Lazy | −1 | −1 | −1 | −1 | −1 | | |
| Generous | +3 | | | | | | income −10% |
| Greedy | −2 | | | | | | income +5%; war chance +0.5 |
| Lustful | | | | +2 | | | fertility +25% |
| Chaste | | | | | +2 | | fertility −25% |
| Temperate | | | +2 | | | | health +0.25 |
| Gluttonous | | | −2 | | | | attraction −5 |
| Patient | | | | | +2 | | |
| Impatient | | | | | −2 | | |
| Humble | | | | | | | |
| Arrogant | | | | | | | |
| Honest | +2 | | | −4 | | | |
| Deceitful | −2 | | | +4 | | | |
| Gregarious | +2 | | | | | | attraction +5 |
| Shy | −2 | | | | +1 | | attraction −5 |
| Zealous | | +2 | | | | | |
| Cynical | | | | +2 | +2 | | |
| Trusting | +2 | | | −2 | | | |
| Paranoid | −1 | | | +3 | | | |
| Forgiving | +2 | | | −2 | +1 | | |
| Vengeful | −2 | | | +2 | | +2 | |
| Compassionate | +2 | | | −2 | | | attraction +5 |
| Callous | −2 | | | +2 | | | attraction −5 |
| Sadistic | | | | +2 | | +4 | opinion −10 |
| Stubborn | | | +3 | | | | |
| Fickle | +2 | | −2 | +1 | | | |
| Eccentric | −2 | | | | +2 | | |

The two triples are Compassionate / Callous / Sadistic and Stubborn / Fickle / Eccentric. Humble and Arrogant have no value with an effect and are shown only.

## Congenital grades

 (`intellect`, `physique`, `beauty`; integers −3 to +3; inherited by DP1.4, else the birth chances in the table, per side).

| Grade | Intellect (all skills) | Birth chance | Physique (prowess, health) | Beauty (diplomacy, fertility) | Birth chance |
|---|---|---|---|---|---|
| +3 | Genius +5 | 0.05% | Herculean +8, +1 | Beautiful +3, +30% | 0.15% |
| +2 | Intelligent +3 | 0.25% | Robust +4, +0.5 | Handsome +2, +20% | 0.25% |
| +1 | Quick +1 | 0.5% | Hale +2, +0.25 | Comely +1, +10% | 0.5% |
| −1 | Slow −2 | 0.5% | Delicate −2, −0.25 | Homely −1, −10% | 0.5% |
| −2 | Stupid −4 | 0.25% | Frail −4, −0.5 | Ugly −2, −20% | 0.25% |
| −3 | Imbecile −8 | 0.05% | Feeble −6, −1 | Hideous −3, −30% | 0.15% |

## Congenital traits

 (one `congenital` bit-set column; inherited by DP1.4, else the 0.5% birth chance). Each trait is rolled on its own. Giant and Dwarf exclude each other; the first rolled wins. Health values feed effective health ([health](health-and-mortality.md)); opinion values feed the reputation term of [directed opinion](opinion-and-relationships.md), which marriage, district loyalty, noble popularity and diplomatic drift read.

| Trait | Skills | Prowess | Health | Fertility | Opinion (scope in DP10) |
|---|---|---|---|---|---|
| Giant | | +6 | −0.25 | | |
| Dwarf | | −4 | | | |
| Clubfooted | | −2 | | | |
| Hunchbacked | | −2 | | | −10 |
| Spindly | | −1 | −0.25 | | |
| Lisping | diplomacy −2 | | | | |
| Stuttering | diplomacy −2 | | | | |
| Bleeder | | | −1.5 | | −10 |
| Wheezing | | | −0.15 | | −10 |
| Infertile | | | | −50% | |
| Scaly | | | | −20% | −10 |
| Albino | | | | | −10 |
| Depressed | diplomacy, martial, stewardship, intrigue −1 | | −0.5 | −10% | |
| Lunatic | | | −0.25 | | −10 |
| Possessed | | | −0.5 | | |

## Carried traits

 (carried grades and a `carried` bit-set). A grade or trait is *active* (it shows and has its effects) or *carried* (no effect, but it can be passed on).

Each parent is active (A), carrying (C) or neither (N) for the trait:

| Parents | Child active | Else child carries |
|---|---|---|
| A + A | 80% | 100% |
| A + C | 50% | 100% |
| A + N | 25% | 75% |
| C + C | 10% | 50% |
| C + N | 2% | 25% |
| N + N | birth chance | never |

- **Single traits** use the table directly.
- **Grades** run the table for each side of a ladder (good, then bad), from tier 3 down to tier 1, and stop at the first tier that comes up active:
  - A parent counts as A at tier `t` if their active grade on that side is `t` or higher, and as C if their carried tier on that side is `t` or higher.
  - A parent whose grade on that side is lower than `t` also counts as C, with the active chance multiplied by 0.2 for each tier of difference beyond one.
  - When both parents are A at a tier below 3 and the child comes up active, the child is raised one tier with probability 0.5.
  - If the good side comes up active, the bad side is not rolled and the child carries nothing on it.
  - **Stored result.** Each ladder stores a signed active grade, a carried good tier (0–3) and a carried bad tier (0–3). The two sides have separate carried slots, so a carried result on one side never displaces one on the other, whatever their tiers, and a child can show a bad grade while carrying a good one.
  - On each side the carried tier is the highest tier that came up carried, kept only if it is above that side's final active tier. Tiers are rolled downward and rolling stops at the first active one, so every carried result is already above the active tier before the raise. A raise that reaches the carried tier clears it (carried Intelligent, active Quick raised to Intelligent: nothing carried); a raise that stays below it keeps it (carried Genius, active Quick raised to Intelligent: Genius still carried).

**Fertility effect (FR1.2, FR1.3).** The person's fertility term in `FERTILITY.bear` is multiplied by `max(0, 1 + sum)` of the active beauty grade, congenital, Lustful and Chaste fertility values in the tables above. Carried traits do nothing. This is the first DP1 step that changes outcomes, so it gets its own report.

**Effective attribute** (`ATTRIBUTES.effective`, pure; not stored): form the additive sum of base, active personality, grades, congenital and cumulative condition modifiers; multiply it by `max(0, 1 + sum of applicable condition percentage modifiers)`, then floor the result at 0. Incapacity overrides all six values to 0. This supports percentage prowess/skill losses without applying them twice. The condition modifiers are the summed level rows of the person's ageing conditions, Blind and Incapable ([health](health-and-mortality.md#effects)); the simulation takes them from `HEALTH.attributeConditions` and the record from the recorded levels. Tiers: 0–4 Terrible, 5–8 Poor, 9–10 Average, 11–13 Good, 14+ Excellent.

**Neutral points** (`ATTRIBUTES.neutral`): diplomacy 5.5, martial 5.4, stewardship 5.4, intrigue 5.7, learning 6.0; prowess stays 5.

## Governors and attribute effects

`GOVERNOR.of({ state, realm })` is the regent while a regency is active, else the ruler. `GOVERNOR.attribute` returns that person's effective attribute, 5 for a regency council, and the neutral point for an empty seat. `d(a)` below is `attribute − neutral`.

| | Effect | Formula |
|---|---|---|
| DP3.1 | `rebel` laxity (`war/index.ts`), both call sites and `weakCrownRevolt` | laxity `+= clamp(−0.0125 × d(diplomacy), −0.1, 0.1)` for the overlord |
| DP3.1 | `candidate` strength (`succession/systems`) | `+= 0.025 × d(diplomacy)` of the candidate |
| DP3.2 | `attackerMultiplier` / `defenderMultiplier` passed to `MILITARY.fight` | `× clamp(1 + 0.025 × d(martial), 0.87, 1.21)` for each side's war leader |
| DP3.3 | `ECONOMY.revenue` at read (the realm cache is keyed on hierarchy and census versions, not on the ruler); `surplus` reads through it | `× clamp(1 + 0.025 × d(stewardship), 0.87, 1.21)` |
| DP3.4 | `usurpChance` (`succession/index.ts`) | `× clamp(1 + 0.125 × d(intrigue), 0.5, 2)` for the regent |
| DP3.5 | `own` term in `KNOWLEDGE.advanceKnowledge`, passed in by the caller per sovereign | `× clamp(1 + 0.0125 × d(learning), 0.93, 1.10)` |

The attribute rates are 1.25 times the previous CK3 per-point values. Removing the former focus bonus narrows the skill distribution; this factor preserves the observed spread of applied outcomes while caps remain unchanged. Neutral points shift down by 0.8, and tier bands narrow to retain useful ruler shares.

## Personality decisions

| Effect | Trait change |
|---|---|
| War start roll in `runWar`, today `rng.random() > w` | Becomes `rng.random() < min(1, (1 − w) × m)`, with `m = (1 + sum of the ruler's war-chance values in DP1) / 1.11`. `SUBMISSION.offer` keeps the raw `w`. |
| `usurpChance` | Ambitious regent ×2, Content regent ×0 |
| Restoration `TRY_CHANCE` | Ambitious claimant ×1.5, Content ×0.5, before the cap at 1 |
| `rebel` laxity, district holder | Ambitious +0.02, Content −0.02 |
| `ECONOMY.revenue` | Generous ×0.9; Greedy ×1.05 |

Arbitrary and Sadistic rulers' role-scoped opinion values enter DP10 once, then affect district loyalty through DP10.3/DP3.1. Arbitrary affects actual subjects only; Sadistic affects every observer.

## Record, wiki and diagnostics

The person query returns attributes and tiers, age-gated personality, visible congenital traits and grades. The page shows personality chips in the main stat block, coloured virtue, vice or temperament, and an Attributes group with a Physical chip row for grades and congenital traits, coloured gift, defect or lineage. Carried traits have no visible effect.

The character report has separate `rulers` and `people` populations, each split into `all`, `adults` (16+) and `minors`. Each nonempty group reports attribute means, deviations, tiers and 0–37 histograms; active personality, grade, congenital and carried shares. Empty groups contain only `observations: 0`. Rulers are sampled per sovereign seat yearly, so their observations count ruler-years. Everyone alive, including rulers, is sampled every tenth year relative to the run start; these observations count person-samples.

`enrichment` compares distinct adult sovereign rulers with other adults on those same ten-year dates. It gives both populations' observations and distributions plus differences in attribute means and personality, grade and congenital shares. This is descriptive enrichment: dynasty, fertility and survival also differ, so it cannot isolate selection.

`appliedEffects` measures applied values after caps, their mean and deviation, mean attribute-minus-neutral delta, and cap shares. Laxity, battle, revenue and knowledge use each sovereign realm's governor yearly (including regents and councils). Usurpation uses relative/protector regent-years. The uncapped `candidateProxy` samples district holders yearly; it does not measure actual election candidates and carries no spread acceptance criterion. All distributions accumulate counters rather than retaining person-sample rows. Existing effect diagnostics retain realm observations for tercile comparisons; weak-crown causes remain unchanged. Knowledge diagnostics exclude diffusion.

History report output preserves completed report folders; the runner does not prune earlier baselines.

## Sources and deferred consumers

The trait names, modifiers and inheritance chances come from the local Crusader Kings III 1.19.0.6 install: `common/traits/00_traits.txt`, `common/defines/00_defines.txt`, `common/modifiers/00_basic_modifiers.txt` and `events/death_events/death_management_events.txt`. Hash constants follow Austin Appleby's public-domain MurmurHash3. Base parent weight 0.5 follows Plomin & Deary (2015); personality parent bias 0.4 follows Vukasovic & Bratko (2015). Effect caps are simulation design choices documented in the character plan.

Attraction and role-scoped opinion affect marriage scoring. Health values and the ageing conditions are live: see [health](health-and-mortality.md). Childhood skill rolls, lifestyle perks and old-record compatibility are excluded.

## Marriage attraction and scoped reputation

[Marriage scoring](marriage-and-alliances.md) reads attraction from the same trait table as other modifiers: Beauty grades contribute −30/−20/−10/0/+10/+20/+30; positive Physique +5/+10/+15, negative Physique −2/−3 contribute −5/−10 (Delicate zero). Brave/Craven contribute +10/−10; Gregarious and Compassionate +5; Shy, Callous and Gluttonous −5. Hunchbacked/Scaly −30, Dwarf −20, Clubfooted/Spindly/Lunatic/Possessed −10 and Giant −5. Carried traits do nothing. Cumulative ageing and Blind attraction effects are added by the live adapter.

The [opinion evaluator](opinion-and-relationships.md) uses general reputation for Sadistic and Albino (−10 each). Arbitrary (−5), Hunchbacked, Bleeder, Wheezing, Scaly and Lunatic (−10 each) apply only from a direct district holder toward their actual sovereign holder, once across all held seats. These are not general marriage penalties.

## Orientation and related-parent births

Every person has a lifelong orientation from the name seed, hash channel 420: heterosexual 89%, homosexual 5%, bisexual 5%, asexual 1%. It is visible from age ten and changes neither marriage eligibility nor fertility. Redrawing traits leaves it fixed.

The congenital table has seventeen traits. Bits 15 and 16 are Inbred and Pure-blooded, with no carried state. With parental relatedness `r`, Inbred has independent chances `0.3*r*max(0,1-0.5*pureBloodedParents)` and 0.15 from each Inbred parent. Only if not Inbred, Pure-blooded has chance `0.03*r`, plus independent inheritance of 0.15 from one parent or 0.75 from two. Unknown parents give zero relatedness. Hash channels 400–405 isolate these choices from shared streams.

Inbred gives diplomacy/martial/stewardship/intrigue/learning −5, prowess −2, health −1.5, fertility −0.5, attraction −30 and vassal opinion −10. Pure-blooded gives health +0.25 and fertility +0.1. CK3 1.19.0.6 supplies the multipliers and effects; interpreting its native relatedness calculation and applying the pure-blooded reduction to parents are explicit modelling choices. The nine `enables_inbred` traits retain their existing carried-gene inheritance; no undocumented native extra effect is assumed.

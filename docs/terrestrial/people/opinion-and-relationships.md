# Directed opinion and family relationships

Scope: `:history`.

`OPINION.of` computes one person's attitude toward another without storing a pair matrix or drawing randomness. Unknown or not-yet-created people return unavailable. Self-opinion is unused. Historical attitudes toward dead targets remain inspectable; live decisions retain their alive/role guards.

The total is `clamp(personality + culture + religion + reputation + kin + spouse + memories, −100,100)`. The returned breakdown includes every term and the unclamped sum, so saturation is explainable.

- Personality: +5 per shared active trait, −5 per opposing-group pair, including both triple groups; activation follows ages 9/11/13. Carried traits contribute nothing.
- Culture: +10 for the same known birth culture; otherwise +5 for different known cultures with the same known heritage; otherwise zero. Unknown IDs never match and culture/heritage never stack. Heritage is indexed by the person's culture, independent of migration.
- [Religion](religions-and-doctrines.md): doctrines, virtues and sins do not enter opinion. +15 for the same known residence-derived realm religion at the selected time, zero otherwise. Territorial sovereignty, residence and realm religion use their effective-time histories.
- Reputation: active Sadistic and Albino −10 each for everyone. Active Arbitrary −5; Hunchbacked, Bleeder, Wheezing, Scaly and Lunatic −10 each only for a direct district holder toward their actual sovereign holder. The observer's held district's direct parent must be a sovereign seat held by the target at that time. Check all held districts and crowns; one qualifying intersection suffices and repeated matches do not stack. Residence, royal kinship, former holdings and indirect superior roles never establish this predicate.
- Close kin: +10 once for known parent/child or full/half siblings. Unknown parents do not establish siblinghood. Dynasty alone has no effect.
- Spouse: +10 from the completed wedding, excluding the instant of either partner's actual death. Betrothals earn nothing; other applicable affinity survives death.
- Memories: the sum of what the observer currently [remembers](#interaction-memories) of the target. Generated ancestry and disposition labels create no friendships or grievances.

The live adapter supplies current traits, culture-indexed retained heritage, residence religion, all held roles and active marriage state. `PERSON_QUERY.opinion` reconstructs those same inputs from the record at the requested time. Holder replacement and territorial reparenting end prior roles immediately. Procedural publication, ownership, creation availability and query transport are described in [person records](../mechanics/person-records.md).

[Marriage](marriage-and-alliances.md) uses each partner's complete directed opinion once, at weight 1, alongside attraction, age, standing, alliance and desperation. Memories are part of that opinion, so a remembered attack or grant moves a match score by exactly its current strength. Kinship remains a hard veto regardless of this affinity. The person page renders both directed totals and their component reasons for spouses, parents, children, siblings and everyone the person remembers or is remembered by at the selected date, with each memory's date and current strength.

## Interaction memories

Code: `src/model/history/sim/people/opinion` (`OPINION.remember`, `.prune`) and `opinion/memory` (`OPINION_MEMORY`, the reason table shared by the evaluator, the log codec and the record).

A memory is one person's recollection of something another person did to them. It is directed: the target holds no matching memory of the observer.

| Occurrence | Who remembers whom | Value |
|---|---|---:|
| An overlord fought beside its vassal in the vassal's war (the aid step at peace) | the vassal's governor → the overlord's governor | +15 |
| An overlord sat that war out (the abandonment step at peace) | the vassal's governor → the overlord's governor | −20 |
| A war is declared | the defender's governor → the attacker's governor | −25 |
| A regent usurps a living ward | the deposed ward → the usurper | −40 |
| A district is granted during the yearly pass | the new holder → the realm's governor | +15 |
| The ruler goes uncrowned | each district holder of the realm → the new ruler | −20 |
| A humble coronation | each district holder of the realm → the ruler | −10 |
| A lavish coronation | each district holder of the realm → the ruler | +10 |
| A magnificent coronation | each district holder of the realm → the ruler | +20 |

The values are design choices scaled against the structural terms: aid equals shared religion, abandonment is twice shared culture, an attack outweighs shared religion plus shared heritage, and usurpation is the largest single grievance. A [coronation](../politics/government-and-succession.md#coronation) is weighed against loyalty: ±10 equals shared culture or close kin and moves rebellion laxity by 0.02, the size of the Ambitious/Content holder trait; ±20 moves it by 0.04, which stays under one weak-claim step (0.05), so ceremony can offset or aggravate a questionable accession but never outweigh legitimacy. +20 is deliberately above a district grant: the grant is one seat, the coronation is the crown's largesse to all of them at once. A customary coronation writes no memory.

- **Who.** The governor is the regent under a regency and the ruler otherwise ([`GOVERNOR.of`](attributes-traits-and-stress.md)), read at the moment of the occurrence. A regency council is no person, so it neither remembers nor is remembered. A person never remembers themselves, and the dead and unborn hold and receive nothing.
- **When.** A memory is written once, after the occurrence succeeds: a war that cannot start, a grant whose recipient cannot take the seat and a year with no usurpation write nothing. An attack is remembered at the declaration, never per battle. In an independence war the crown is the attacker, so the rebel's governor remembers the crown's governor and the crown holds no grievance in return; a peaceful breakaway is no attack. District inheritance, promotion/demotion and partition seating are not grants.
- **Decay.** A memory contributes `value × max(0, 1 − (t − start) / 10)` from its start and nothing before it: full strength at once, half after five years, gone at ten. The ten-year linear fade is a design choice: an interaction matters for several yearly marriage passes without poisoning the next generation.
- **Refresh.** One entry exists per observer, target and slot (`OPINION_MEMORY.slotOf`). Each of the first five reasons is its own slot; the four coronation reasons share one. A repeat restarts its slot from full strength; it never stacks. Different slots sum. Coronation memories therefore replace each other instead of adding up: the latest non-customary coronation sets the reason and the start, even when it is the lesser one, and a customary coronation leaves an earlier memory to fade on its own. A ruler crowned at accession and again at an elevation within ten years is remembered for the later one, and the combined effect is always within ±20. The record's reconstruction of the latest memory uses the same slots.
- **Succession.** Memories belong to people. An heir inherits none of a predecessor's, and nothing is re-keyed when a throne changes hands; the new governor simply brings their own opinions to the realm's politics.
- **Start.** Initialization writes no memory. Backfilled history, the initial district grants and the wars seeded at the start are the world's past, not interactions between its living people.
- **Storage.** `PeopleState.memories` is a sparse map from observer to target to at most six entries of reason and start; strength comes from the reason table. There is no person-by-person table and no expiry event. The yearly people pass prunes entries that have faded, and those whose observer or target has actually died; a death that is only scheduled prunes nothing. Every refresh is also a [`opinion_memory` log row](../mechanics/person-records.md#rows), which the record keeps, so pruning never loses history.

**What each memory reaches.** Every memory is part of the directed opinion, and so of marriage scores and the relationship views. Aid, abandonment and attack are normally between governors, so they bias [diplomatic drift](#opinion-in-diplomacy) while those two people govern. A grant is normally a holder's memory of their ruler and, with a coronation, is the memory that ordinarily reaches district loyalty; a grant made under a regency is remembered of the regent and adds nothing to loyalty toward the ward. A coronation memory is always of the ruler, since none is written while a regent governs, and it is written after the accession's own revolt test. A holder appointed after the coronation has no memory of it, and one whose seat stops being a district keeps the memory as a person, but it reaches loyalty only while they hold a district of that ruler. A usurped ward's grievance has no guaranteed political consumer.

## District loyalty and noble popularity

Each strength-tested [rebellion](../politics/rebellions-and-throne-wars.md#attribute-and-trait-effects) adds `−0.002 × o` to laxity, where `o` is the district holder's opinion of the realm's actual ruler: the unclamped sum less its religion term, clamped to ±100 (`OPINION.loyaltyOf`). A holder at +50 lowers laxity by 0.1, the size of one weak crown; −50 raises it by 0.1; the term is bounded at ±0.2. A missing holder or ruler, and a ruler who holds the district themselves, contribute nothing.

- **The ruler, not the regent.** The target is the person on the throne even during a regency. A memory of the regent does not become a memory of the ward.
- **Religion is left out.** Religion is the residence-derived realm's, so every holder shares it with their ruler; the term would add the same +15 to all of them. It stays in the full opinion used by marriage, the relationship views and diplomacy.
- **Not counted twice.** The governor's diplomacy and the holder's Ambitious or Content trait remain separate laxity terms, and diplomacy is deliberately absent from the opinion formula.

**Noble popularity** is the arithmetic mean of that same religion-excluded value over the living holders of the realm's direct titled districts, one vote per person however many districts they hold (`OPINION.popularity`). It is reported with the holder count and the count in each of the bands [−100,−50), [−50,0), [0,50) and [50,100]. With no holder it is 0 of 0 and shown as "No district opinions", not as neutrality. It is a summary only: the mean is never fed back into laxity, and military strength and population keep their weight in the rebellion and backing rules. It measures the nobility, not the population. The nation page shows it as "Noble popularity (religion excluded)", computed from the holders, parents and tenures recorded at the selected date (`PERSON_QUERY.popularity`).

## Opinion in diplomacy

When a realm pair's [disposition drifts](../politics/diplomacy-and-subjects.md#personal-bias), the two governors' opinions of each other tilt the transition row: `q = (opinion(a→b) + opinion(b→a)) / 200`. Mutual liking favours moves up the ladder, mutual dislike moves down, and opposed feelings cancel. A council, a missing governor or one person governing both realms gives `q = 0` and the original row. Disposition is never read back into opinion, so the two cannot reinforce each other, and a succession changes only whose opinions supply the next bias: wars, alliances, vassalage and unions stand.

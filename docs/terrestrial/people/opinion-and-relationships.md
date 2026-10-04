# Directed opinion and family relationships

Scope: `:history`.

`OPINION.of` computes one person's attitude toward another without storing a pair matrix or drawing randomness. Unknown or not-yet-created people return unavailable. Self-opinion is unused. Historical attitudes toward dead targets remain inspectable; live decisions retain their alive/role guards.

The total is `clamp(personality + culture + religion + reputation + kin + spouse + memories, −100,100)`. The returned breakdown includes every term and the unclamped sum, so saturation is explainable.

- Personality: +5 per shared active trait, −5 per opposing-group pair, including both triple groups; activation follows ages 9/11/13. Carried traits contribute nothing.
- Culture: +10 for the same known birth culture; otherwise +5 for different known cultures with the same known heritage; otherwise zero. Unknown IDs never match and culture/heritage never stack. Heritage is indexed by the person's culture, independent of migration.
- Religion: +15 for the same known residence-derived realm religion at the selected time, zero otherwise. Territorial sovereignty, residence and realm religion use their effective-time histories.
- Reputation: active Sadistic and Albino −10 each for everyone. Active Arbitrary −5; Hunchbacked, Bleeder, Wheezing, Scaly and Lunatic −10 each only for a direct district holder toward their actual sovereign holder. The observer's held district's direct parent must be a sovereign seat held by the target at that time. Check all held districts and crowns; one qualifying intersection suffices and repeated matches do not stack. Residence, royal kinship, former holdings and indirect superior roles never establish this predicate.
- Close kin: +10 once for known parent/child or full/half siblings. Unknown parents do not establish siblinghood. Dynasty alone has no effect.
- Spouse: +10 from the completed wedding, excluding the instant of either partner's actual death. Betrothals earn nothing; other applicable affinity survives death.
- Memories: zero until opinion-politics interaction memories are implemented. Generated ancestry and disposition labels create no friendships or grievances.

The live adapter supplies current traits, culture-indexed retained heritage, residence religion, all held roles and active marriage state. `PERSON_QUERY.opinion` reconstructs those same inputs from the record at the requested time. Holder replacement and territorial reparenting end prior roles immediately. Procedural publication, ownership, creation availability and query transport are described in [person records](../mechanics/person-records.md).

[Marriage](marriage-and-alliances.md) uses each partner's complete directed opinion once, at weight 1, alongside attraction, age, standing, alliance and desperation. Kinship remains a hard veto regardless of this affinity. The person page renders both directed totals and their component reasons for spouses, parents, children and siblings at the selected date.

# Royal marriages

Scope: `:history`.

A royal marriage is a tie between two sovereign realms. No spouses exist: the tie allies the two realms, binds the alliance while it stands, and ends when either ruler is replaced. It also supplies the daughter's line of a [succession](government-and-succession.md#succession), the claimant of a minor's crown and the partner of an inherited [personal union](personal-unions.md).

Code: `src/model/history/sim/engine/events/diplomacy/marriage` (`ROYAL_MARRIAGE`); the tie map is `state.marriageTies`, keyed by the lower realm id times the province count plus the higher.

## Eligibility

A pair is eligible when both realms are sovereign and have a ruler, both governments marry for alliance (`GOVERNMENT.marriageAlliancesOfIndex`: single-heir realms and non-republican elections), `STATE.canAlly` allows an alliance, and the pair is not at war, overlord and vassal, in a union or a colony.

## Forming

Each year the realms are visited in ascending id. A marrying realm with an eligible bordering partner that it is not already tied to rolls `MARRIAGE_CHANCE × TIE_RETURN^k`, with `k` the ties it already holds. On success it picks the best-disposed eligible bordering realm (lowest id on ties), which accepts with `TIE_RETURN^k_partner`; otherwise no tie forms and the partner is not retried. The map is updated at once, so later rolls that year see the new tie. Success makes the realms allies and Trusted and logs a `marriage alliance` note.

| Constant | Value | Source |
|---|---:|---|
| `MARRIAGE_CHANCE` | 0.0275 | The previous 0.055 calibration, multiplied by the user-requested `FORMATION_SCALE = 0.5` shared with diplomatic pacts. The previous base used 88.6 standing ties, 237.6 marrying realms, 59% holding none and an assumed 11.4-year tie duration: `88.6 / (237.6 × 0.59 × 11.4)`. |
| `TIE_RETURN` | 0.5 | Assumption: monogamous rulers rarely took further royal marriages, but kings married again across generations. Each tie held halves the chance of another, for initiator and partner alike; there is no hard cap. |

The measured mix on the person model was 41% of marrying realm-years holding a tie (91,067 of 221,907) and 1.8 ties per tied realm. The report's `marriageTies` fields (`tiedShare`, `tiesPerTiedRealm`, `meanStanding`) check the constants jointly; `MARRIAGE_CHANCE` is the `k = 0` base rate, left uncorrected for the halving rule.

## At the start

The world begins with ties already standing. Before the first year, after personal unions are seeded, `ROYAL_MARRIAGE.seed` runs the yearly formation pass 3 times with no tie ending (`SEED_YEARS`). The shared formation scale applies to these passes as well as yearly formation. Init adds `SEED_FORMATION_SCALE = 0.8`: the first half-formation report still had 107 tied realms, above half the baseline 181, because fewer subjects made more realms eligible for marriage. The extra factor applies only to the starting passes. Before the scale was halved, the 204,000-point late-medieval world (seed 14963991, start year 867) had 96 ties involving 181 of 1,011 realms (17.9%). The detailed history report records the current starting counts and shares in `diplomaticTies.initial`, separately from annual samples of marriage-eligible realms.

With the calibrated formation scale, the same 204,000-point late-medieval starting world has 48 ties involving 94 realms (9.3%), compared with the previous 96 ties and 181 realms (17.9%). The annual base rate is 2.75%; the extra 0.8 factor applies only at init.

## Ending

A tie ends when either realm's ruler is replaced, whatever the cause, or when the pair stops being eligible; the yearly review checks the second. The alliance stays and drifts like any other: a realm pair holding a tie cannot drift downward while it lasts (`ROYAL_MARRIAGE.bound`). Each end logs a `marriage alliance ended` note.

## In succession

At a succession the dying realm's ties are read first and saved with each partner's ruler, before the ties end with the replacement. On a daughter's-line inheritance a random partner is drawn; with chance `UNION_INHERIT_CHANCE = 0.20` and when the pair can unite, the partner's own ruler takes the throne and the two realms form a union; otherwise a new ruler of the partner's dynasty does. On a minor's crown a random saved partner is the claimant of a `claim` war if its ruler is unchanged, neither realm is pressing a war for a throne, the pair can still unite and the war gate allows it. Between marriage partners that gate ignores the alliance and requires the claimant's threat ratio to be under the `FRIENDLY` attack threshold (0.1). See [personal unions](personal-unions.md#foreign-claims).

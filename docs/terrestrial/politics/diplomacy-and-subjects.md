# Diplomatic attitudes, alliances and vassalage

Scope: `:history`.

A realm pair’s attitude is separate from formal alliances, subject ties and personal unions, and from title ownership. This reference covers general diplomatic drift and subject obligations.

Code: `src/model/history/sim/engine/events/diplomacy`.

## Diplomatic dispositions

Every pair of realms has a shared attitude: Rival, Suspicious, Neutral, Friendly or Trusted. Formal alliances, vassalage, unions, colonies and wars are separate ties. Neighboring pairs start with one weighted attitude draw; a Trusted draw has an 18% chance to create an alliance if allowed. Other pairs start Neutral.

On each realm's diplomacy event, neighboring pairs and its direct formal-tie partners roll through the five-state transition matrix. An active war does not drift. An alliance bound by a [royal marriage tie](royal-marriages.md) cannot drift downward. Only a free neighboring pair already Trusted at the start of the event rolls a 0.75% chance to form a pact. A smaller realm can become a vassal when its revenue is under half the other's; otherwise an allowed pact is an alliance. An unbound alliance dissolves with chance 0% at Trusted, 10% at Friendly, 35% at Neutral, 70% at Suspicious and 100% at Rival.

## Formation scale and starting subjects

`DIPLOMATIC_FORMATION` applies `FORMATION_SCALE = 0.5` to alliance and vassalage formation opportunities, following the user's request to halve both starting ties and ongoing formation. The normal pact chance falls from 0.03 to 0.0075, including a second 0.5 calibration factor to compensate for more eligible free partners, the marriage base chance from 0.055 to 0.0275, and a new formal repayment bond after rebel backing receives a 50% gate. Existing backing bonds still become Trusted. Marriages must be scaled too because each marriage tie creates an alliance. With just the shared half scale, the calibrated init report still averaged 154.7 alliance pairs against 230.2 previously, so ordinary pacts need the extra reduction to bring standing counts closer to half. Disposition transitions and tie-ending rules keep their previous values; union seeding is separate.

At init, potential overlords are allowed to seed subjects with a 40% chance: each candidate gets one roll the first time it meets the revenue requirement, reused for all its potential vassals. A qualifying smaller neighbor must still have revenue below 30% of the overlord's and pass the existing 40% binding roll. Gating overlord groups reduces both distinct overlords and their subjects together; merely halving the binding roll would tend to spread fewer vassals across too many overlords. The 18% starting alliance roll and 40% overlord gate were calibrated from the first half-formation report: a simple 50% gate left 18.4% of realms allied, 27.2% vassals and 13.7% overlords, above the half-baseline targets of about 12%, 22.3% and 11.6%. A second run with a 25% starting alliance roll still had 78 alliance pairs (47 marriage-bound and 31 other pairs), above half the baseline 139. Reducing the other-pact roll to 18% targets about 22 other pairs alongside roughly 47 marriages. The actual realm shares are measured by the detailed report rather than assumed equal to the probability reduction.

A Rival vassal refuses its overlord's war call and withholds tribute. A Suspicious vassal refuses an offensive call. An overlord that fights beside its vassal in the vassal's war raises the pair's disposition one step at peace; one that sits out lowers it one step. A Rival or Suspicious ally refuses a defensive call until its alliance dissolves.

Subject secession thresholds are in [rebellions](rebellions-and-throne-wars.md#subject-secession-thresholds). Marriage-bound alliances follow [royal marriages](royal-marriages.md).

## History report

The calibrated 204,000-point late-medieval report (seed 14963991, start year 867) starts with 241 vassals, 121 distinct overlords and 74 alliance pairs involving 135 realms. The previous counts were 451, 234 and 139 pairs involving 242 realms. These are reductions of about 47–48% in counts; chance scaling does not imply an exact halving of each realized count. Across the first 100 years, mean counts fall from 180.8 to 103.6 vassals, 87.3 to 39.7 overlords and 230.2 to 132.7 alliance pairs. Realm shares use the changing realm denominator and need not fall in the same proportion as counts.

`pnpm report:history` exposes `diplomaticTies` alongside the other per-window report sections and prints a dedicated console table. Its schema is `src/test/history-run/report/diplomatic-ties/types.ts`.

Each window has exact `initial` and `end` snapshots, a `mean` over the existing ten-year sample cadence, and the number of `samples`. Snapshots include their year and the count of active landowning realms. The denominator includes vassals, union juniors and colonies, but excludes desolate and stateless provinces.

For `alliance`, `vassal`, `union`, `dependency`, `marriage`, `war` and `any`, `ties` reports unique realm `pairs`, distinct participating `realms` and their `realmShare`. `roles` reports distinct vassals, overlords, union juniors and seniors, each with a realm count and share. Vassalage and union pairs are counted once regardless of direction; colony dependencies are separate from vassalage. War pairs are formal `WAR` relations rather than counts of war objects. `any` includes wars and deduplicates pairs and realms across categories, so a marriage-bound alliance contributes once to the total.

Mean pair and realm counts are arithmetic means across samples. Mean realm shares are participating realm-samples divided by all realm-samples, which weights each sample by its realm count. A window shorter than ten years has zero samples and zero mean counts; its exact endpoints still show the standing ties. End snapshots always use the actual window boundary, including a final partial century, rather than the last decadal sample.

The military section retains formation and ending rates, relationship attitudes and eligibility diagnostics. Standing tie counts and realm coverage live in `diplomaticTies`; the marriage and union sections retain their annual lifecycle statistics. The starting marriage and union measurements are the first window's `diplomaticTies.initial`.

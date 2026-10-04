# Marriage, betrothal and family alliances

Scope: `:history`.

These rules select spouses and connect ruling families through weddings, betrothals and alliances. [Families](families-and-lifecycle.md) owns births and kinship; [household residence](residence-and-realm.md) owns relocation; [diplomacy](../politics/diplomacy-and-subjects.md) owns general realm attitudes and formal ties.

Code: `src/model/history/sim/people/family`, `betrothal` and `sim/engine/events/people/royal-marriages`.

## Marriage

Once a year (`FAMILY.runYear`) all living tracked noble-family adults can participate, including grandchildren, nieces/nephews and retained outsiders. This does not create population-level people.

1. **Who seeks.** Unmarried or widowed women aged 16–44 and men 18–69, unbetrothed; each participates with 35% chance. Royal minors keep the narrower ruling-family rules below. The participating IDs and seeker order stay fixed for the pass.
2. **Foreign search.** The existing roll is 80% in sovereign alliance-marrying realms and 30% otherwise. When it succeeds, search neighbouring realms, then their neighbours. Royal blood (a sovereign or their child) searches royal candidates in both rings before other candidates. Rank across the whole current ring, with lowest person ID breaking ties.
3. **Domestic search.** If the foreign roll fails or finds no mutually acceptable pair, search participating adults in the seeker's live realm, royal candidates first for royal blood. Minors cannot form domestic betrothals.
4. **Outsider fallback.** After all allowed searches fail, an adult gets one outsider opportunity with probability `min(0.5, max(0, age−25)/20)`: zero through 25, 25% at 30, 50% from 35. This uses hash channel 140, salt completed age-year, and no shared RNG draw. The outsider is generated only on success, has unknown parents and an age clamped to the adult bounds. Existing generation draws remain.
5. **Onboarding and rejection.** Every instantiated outsider receives the ordinary survivor health replay, creation snapshot and one mortality projection for `[Y,Y+1)` before either score. A rejected outsider remains unmarried and tracked; it is not offered elsewhere in this fixed cohort. Later health, death scheduling and yearly participation apply normally. There is no replacement roll or special royal waiting cutoff.

Known blood relatives are prohibited: each person's entire known ancestor set includes themselves, and any intersection vetoes weddings and betrothals before scoring. Unknown parents never intersect. Traversal is cycle-safe and cached only for this pass. This conservatively blocks cousins and distant known kin without claiming unknown-parent outsiders are biologically unrelated. Completed marriages remain intact. Starting ancestry is finalized before traits and all proposed historical weddings pass this same veto.

Each directed score is:

`attraction(partner) + opinion(self→partner) − 2×min(abs(age gap),15) + 10×max(current standing, projected standing) + alliance + 5×max(0,self age−25)`.

Both scores must be at least zero. Acceptable candidates rank by their pair sum. Rejection leaves candidates available. [Opinion](opinion-and-relationships.md) supplies personality, culture/heritage, religion and scoped reputation exactly once; attraction remains separate. [Traits and health](attributes-traits-and-stress.md) supply attraction modifiers. Standing is 1–5 for county through hegemony, zero when untitled; former peak standing contributes nothing. Read-only inheritance projection shares `HEIRS` ordering, gender laws, district heir selection and partition allocation with actual succession; elections and appointments give no speculative inheritance.

An actual eligible royal alliance contributes 70 for a higher current partner standing, 25 for equal, 10 for one lower tier, 10/3 for two lower tiers and zero for three or more; divide by 1.5 when already allied. Domestic and private marriages get zero. Projected inheritance never guarantees an alliance.

Each accepted pair completes marriage/betrothal pointers, residence and alliance/union settlement immediately. Refresh person contexts and regroup the remaining participating IDs by live realm before the next seeker. Projected inheritance is computed once before matching. District lines are not recomputed within the pass, because no match changes a holder, a seat or a family tree; crown lines and realm neighbours are recomputed only when the settlement founded a union, the one consequence that changes who may inherit a crown. A new alliance or a household move leaves every line as it was, so the retained values equal a full recomputation. Regrouping uses live realms; government, sovereignty, war, union, royalty and existing-alliance checks use that refreshed state. The unlanded spouse joins the landed spouse's household, or else the male spouse's; separately landed partners keep their locations. Conception projection follows the final completed couples. Historical founder backfill also validates reciprocal scores; generated ancestral parents retain their completed marriage.

Starting families use [dated ancestry and bounded historical marriages](families-and-lifecycle.md#starting-families). Outsider spouses are never reparented into neighbouring houses. Historical wedding scoring uses zero held/projected standing and no alliance; the later initial betrothal pass uses ordinary live scoring and projection.

### Market diagnostics

The detailed history report captures selection-time inputs before wedding effects and aggregates immediately, without retaining rejected pairs. Each domestic group or foreign ring/royal pass is a search, including empty scans. Visited, hard-eligible, kinship-vetoed and evaluated proposal counts are separate. Rejection counts are observer-only, candidate-only and both-negative; their union divided by evaluated proposals is the rejection rate. Several-candidate share uses searches with at least two evaluated proposals divided by all searches.

Diagnostic first-fit is the first hard-eligible, kinship-allowed candidate in that same scan before the reciprocal floor. Differences are rejection-only when first-fit fails a floor, ranking when it clears both; otherwise unchanged. The comparison denominator excludes empty scans. Directed component means average both scores of accepted pairs; the pair sum is also reported. Domestic weddings, foreign weddings, betrothals and outsiders have separate bins. Culture, heritage and religion shares each use their own both-known-ID denominator; ruler tiers use current crowns. Fallback opportunities, instantiated attempts and acceptances have separate age bins. Zero denominators are unavailable.

Windows are `[startYear,endYear)`; a boundary event belongs to the next window and the endpoint is excluded. Scoring time, projection refresh count/time and maximum pass-local ancestor-set memberships are reported separately from composition. [Person records](../mechanics/person-records.md) describes transport and creation availability.

## Betrothal

Royal houses promise their children before they come of age, as in CK3 (`BETROTHAL`, matched by `FAMILY.seekMatches`).

- **Who.** Members of a sovereign ruler's family (the ruler, children, siblings) aged 12–15 in alliance-marrying realms, unmarried and unbetrothed, seek with 35% chance a year. They never take a home match.
- **Match.** The same foreign rings. When either party is a minor, both must be 12+, at most 5 years apart, and the pair must pass the marriage-alliance check (`ROYAL_MARRIAGES.alliable`). A betrothal is always an alliance match.
- **Result.** Either party under 16 makes a betrothal (`betrothed` and `betrothedAt` on both); two adults wed as before. The betrothal forms or binds the marriage alliance at once.
- **Fulfilment.** Each yearly pass weds every living pair where both are 16+, by the usual host rule. Heiress unions apply. Betrothed men therefore marry at 16.
- **Breaking.** Three causes:
  - *kinship*: the full known-ancestor veto fails at fulfilment; released once without a wedding;
  - *death*: either party died (released at the death);
  - *alliance*: the review finds no marriage alliance between the pair's realms (war, lost sovereignty, a government that stops marrying for alliance, or a succession that moves the betrothed out of the ruler's family). A betrothal whose alliance cannot form is broken at once.
- **Start.** After all starting families, district grants, patricians and household reconciliation, every eligible royal minor seeks once in canonical seat/person order, using a separate keyed source and the same veto/scorer/projection. Adult seekers are empty; this pass creates betrothals and settles alliances, without starting weddings or unions.

## Alliances from marriage

- A wedding or betrothal between the ruling families (ruler, children, siblings) of two sovereign, alliance-marrying realms makes them allies, unless they are at war or in a subject or union bond. The note is `marriage alliance`.
- While a living marriage or betrothal joins the two ruling families, the alliance does not re-roll in diplomacy. When none is left, the marriage alliance ends, its betrothals are broken, and the alliance drifts like any other.
- A regent parent born into another ruling house holds the alliance with that house's realm the same way while she governs.

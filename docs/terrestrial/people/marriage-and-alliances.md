# Marriage, betrothal and family alliances

Scope: `:history`.

These rules select spouses and connect ruling families through weddings, betrothals and alliances. [Families](families-and-lifecycle.md) owns births and kinship; [household residence](residence-and-realm.md) owns relocation; [diplomacy](../politics/diplomacy-and-subjects.md) owns general realm attitudes and formal ties.

Code: `src/model/history/sim/people/family`, `betrothal` and `sim/engine/events/people/royal-marriages`.

## Marriage

Once a year (`FAMILY.runYear`) for rulers, their children and their siblings:

1. **Who seeks.** Unmarried or widowed women 16–39 and men 18–49 who are not betrothed; each seeks with 35% chance that year. Royal children aged 12–15 also seek (see Betrothal).
2. **Foreign or home.** Families of realms that marry for alliance (single heir, or non-republic election) look abroad 80% of the time; others 30%.
3. **Foreign search.** Neighbouring realms first, then neighbours' neighbours, among that year's other seekers of the opposite sex. *Royal blood* (a sovereign ruler or their child) looks for royal blood across both rings before settling for a lesser house. The unlanded spouse joins the landed spouse’s household, or else the male spouse’s; separately landed spouses retain their seats and locations.
4. **Waiting.** Royals of alliance-marrying realms who find no foreign match and are under 25 (minors included) stay single and try again next year.
5. **Home match.** Otherwise they marry a made-up outsider of no house from their own culture: a wife up to 8 years younger (at least 15), a husband up to 8 years older.

A foreign match where either party is under 16 is a betrothal, not a wedding (see Betrothal).

At the start, 40% of married kings in alliance-marrying realms have their queen re-parented into a neighbouring ruling house, as that ruler's sister or daughter when the ages fit (`ROYAL_MARRIAGES.seed`).

## Betrothal

Royal houses promise their children before they come of age, as in CK3 (`BETROTHAL`, matched by `FAMILY.seekMatches`).

- **Who.** Members of a sovereign ruler's family (the ruler, children, siblings) aged 12–15 in alliance-marrying realms, unmarried and unbetrothed, seek with 35% chance a year. They never take a home match.
- **Match.** The same foreign rings. When either party is a minor, both must be 12+, at most 5 years apart, and the pair must pass the marriage-alliance check (`ROYAL_MARRIAGES.alliable`). A betrothal is always an alliance match.
- **Result.** Either party under 16 makes a betrothal (`betrothed` and `betrothedAt` on both); two adults wed as before. The betrothal forms or binds the marriage alliance at once.
- **Fulfilment.** Each yearly pass weds every living pair where both are 16+, by the usual host rule. Heiress unions apply. Betrothed men therefore marry at 16.
- **Breaking.** Only two causes:
  - *death*: either party died (checked at the start of the yearly marriages);
  - *alliance*: the review finds no marriage alliance between the pair's realms (war, lost sovereignty, a government that stops marrying for alliance, or a succession that moves the betrothed out of the ruler's family). A betrothal whose alliance cannot form is broken at once.
- **Start.** After `ROYAL_MARRIAGES.seed`, every royal minor seeks once, under the same rules. The world opens with about a third fewer standing betrothals than it holds at years 20–30.

## Alliances from marriage

- A wedding or betrothal between the ruling families (ruler, children, siblings) of two sovereign, alliance-marrying realms makes them allies, unless they are at war or in a subject or union bond. The note is `marriage alliance`.
- While a living marriage or betrothal joins the two ruling families, the alliance does not re-roll in diplomacy. When none is left, the marriage alliance ends, its betrothals are broken, and the alliance drifts like any other.
- A regent parent born into another ruling house holds the alliance with that house's realm the same way while she governs.

# Personal unions

A personal union ties the realms of one person who rules several single-heir realms. Union links are formal ties: they stop the two realms attacking each other and make them fight together.

## Formation and blocks

- **Formed** when one person comes to rule two single-heir realms by inheritance, when two reigning single-heir rulers are married to each other (the heiress case), or when a foreign claim is won (see below).
- **Single-heir only.** `STATE.canUnite` is the one test every new link passes, through inheritance, installation of a ruler and marriage. It requires both realms to be single-heir. An elected or appointed ruler who is next in line to a single-heir realm is passed over like any heir whose crown is incompatible.
- **Senior** is the realm that must lead (it already has juniors or an overlord), else the one with more provinces.
- **Blocked** for a new external link when realms are at war, either is not single-heir, either is already a union junior, or both must lead. Existing group membership stays compatible whatever the members' government has since become; eligibility checks every held crown.
- **Ended** when a partner's living ruler is someone other than that person or their spouse.
- **Continued.** Juniors whose senior is lost (a new ruler at the senior, or the senior absorbed) and that are still ruled by one living person stay together: the largest becomes their senior, generation counts are kept, and a `personal union continued` note is logged.
- **Merged** into the senior when an adjacent junior has had 3 shared rulers.

A living heir must be compatible with every held sovereign crown. Districts do not veto unions. Existing group membership follows junior-to-senior union edges only; diplomatic overlords and territorial parents are excluded. Sibling juniors can continue their existing group without a sibling link, even while their dead senior awaits its turn.

Installation rechecks surviving crowns after each external link. Each actual senior-junior edge advances once when both endpoints share the living successor, using the accounted-edge set of the walk's context (`state.successionContext`, set for the duration of one death's walk and null otherwise). New edges start at generation 1; spouse-only shared unions do not advance generations. Merger eligibility is checked immediately after continuation, and removed seats are skipped. Installation and separately crowned spouses preflight all crown pairs before adding external links.

## No untied double rule

At every year boundary the sovereign realms one living person rules share one union group. The report validates this each year (`ruler of realms outside one union group`). The paths that could break it are closed:

- **War for a throne.** A realm that attacks in a throne or claim war cannot be inherited by someone who rules another sovereign realm, and its ruler cannot inherit another realm, while the war runs. The next in line inherits instead.
- **Released districts.** A district released from its realm keeps its living holder only when the holder's other sovereign crowns can unite with the new realm and the holder does not rule the realm the district leaves; otherwise a new house is founded.
- **Lost seniors.** Juniors continue together (see above).

## Foreign claims

When a single-heir succession is disputed, one more walk down the dead ruler's line finds a foreign claimant: the first person other than the heir who is 16 or older, of the culture's preferred sex, alive and capable, rules exactly one sovereign realm, and could inherit this one (so both crowns are single-heir and can unite, and the claimant is not already at war for a throne). The search runs whether or not a home rival exists; the `succession` note records `foreignClaimant`.

After the succession's revolts, if the claimant still qualifies and is not the installed ruler, the claimant's realm may declare a `claim` war on the realm. The gate is the ordinary conquest declaration applied to that one neighbour: independent realm with a strong crown, no truce, no formal tie, no war with it, threat under the disposition threshold, and the governor's war roll. No new willingness constant exists, and no buy-off or submission offer is made.

A claim war is an interstate war fought, scored and targeted like a conquest war, with no rebels or backers. It records the claimant and the defender's ruler at the start.

- **The claim stands** while the claimant lives and is capable, the claimant's only sovereign crown is the attacker, the defender's ruler is still the one the claim was pressed against, and the pair could still unite (the pair's own war disregarded).
- **Lapse.** When the claim stops standing, `CONQUEST.settle` ends the war with reason `claim lapsed`: a lapsed outcome with the defender as winner, nothing moves, and the usual truce follows.
- **Union.** When the score reaches +100, or the war ends for any reason while the attacker holds the defender's capital, and the claim stands, the claimant takes the throne and the two realms form a union. No land moves, occupations are cleared, the displaced ruler becomes the realm's deposed claimant, and no truce or Suspicious disposition follows because a union already excludes attack.
- **Otherwise** the war ends as any conquest war without land: an indemnity roll for `defended`, `offensive spent` and `offensive repelled`, else white peace. Occupied land is handed back at every ending.

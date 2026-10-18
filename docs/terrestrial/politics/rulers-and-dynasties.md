# Rulers and dynasties

Scope: `:history`.

Every sovereign realm has exactly one ruler. History also reserves the identities and births of surviving direct children for [succession](government-and-succession.md), without a people model. Ruling columns live at sovereign roots; [royal marriages](royal-marriages.md) tie realms and [personal unions](personal-unions.md) let one ruler govern several realms.

Code: `src/model/history/sim/engine/state/rulers` (`STATE_RULERS`), seating and unions in `state/index.ts` (`STATE.seatRuler`, `foundRuler`, `unite`), naming in `src/model/history/record/rulers` (`RULER_NAMES`).

## The ruler record

| Column | Meaning |
|---|---|
| `leaderRuntime.rulerId` | Global counter; -1 when the realm has no ruler. A ruler copied onto another throne keeps its id. |
| `leaderRuntime.nameSeed` | Seed of the ruler's given name. |
| `leaderRuntime.nameOrigin` | The province whose language names the ruler: the realm at creation, including early planning. |
| `leaderRuntime.sex` | 1 when the name seed resolves to a woman under the realm's culture gender system (`GENDER_SYSTEM.resolveLeaderGender`). |
| `leaderDynCurrent` | Dynasty id. |
| `leaderRuntime.birth` / `.death` | Birth and death time in engine milliseconds. |
| `leaderClaimCurrent` | Claim strength, 0 to 3. |
| `leaderRuntime.idx` | Accession index, bumped by every replacement, copy, attachment or detachment. |

`state.dynastyOrigin` maps each dynasty id to the province of its first seating. Adoption and copying keep that origin, so a house and a ruler are named from their own origin province, never from the realm that holds them now. `state.rulerSequence` holds the next ruler and dynasty ids; `state.regency` flags a realm governed by a council.

## Seating

`STATE_RULERS.draw` creates a ruler for a realm, `STATE.seatRuler` replaces one. Seating writes the columns, bumps the accession index, schedules the realm's succession at the death date and starts a [regency](government-and-succession.md#regencies) if the ruler is under 16. Succession and regency heap events carry the realm's accession index; an event is ignored unless the index still matches, the realm is still sovereign and, for a succession, the realm is not a union junior. A copied ruler keeps the death date already drawn.

The accession age is drawn from a 5-year-bin table, uniform within the bin:

| Table | Use | Source |
|---|---|---|
| `INHERITED_AGE` | heirs and junior heirs | 4,097 heirs on the person model, 28% of them under 16 against 5 of 18 English and 5 of 22 French reigns begun by a minor (England 1066–1485, France 987–1498, counted from regnal lists) |
| `ELECTED_AGE`, floor 16 | elected rulers | 2,724 elected rulers on the person model |
| uniform 20–50 | new houses, appointees, founders, usurpers, pretenders and the first rulers | existing value, kept |

The death age is drawn from `DEATH_AGE`, the age of every ruler at the 7,668 deaths that opened a succession on the person model, restricted to ages above the accession age: the bin containing the accession age keeps only the part above that age, weighted by the share that remains, so the death is always after the accession. Together the tables give a mean reign of 29.8 years against 30.3 measured on the person model (231,807 sovereign-years over 7,655 successions). Both exceed the 23-year mean reign of the English and French lists, and the measured mean adult age at death of 57.7 exceeds Cummins' 48 for English and Welsh nobles born 800–1400. Making rulers die younger is deferred.

Those reign statistics describe the original unconditioned ruler draws. `STATE_RULERS.drawHeir` clips the inherited-age bins by their overlap with the known parent's fertile window. Birth must follow the parent's sixteenth birthday plus 280 days, fall no later than their natural death, and precede a mother's forty-fifth birthday. These constants mirror `src/model/people/fertility` locally; history does not import that model. Junior children must be strictly younger than the primary. Empty windows return no child. Death ages are conditioned on survival to the parent's succession, with the existing positive floor of one millionth of a year; these scheduled deaths remain internal.

## Early heir plans

`HEIR_PLAN` in `state/rulers/heirs` keys promises by person `rulerId`, independently of realm. Seating ensures the ruler's plan and their primary child's plan, with no further recursion. Outcomes and child identity, name inputs, sex, dynasty and birth are rolled once; the planning realm's culture determines sex using the existing gender system. A planned primary keeps their own plan when seated. Founders, other successors and seated juniors first receive plans at their own seating. Children can already have been born then, even with two levels of planning.

Plans roll surviving children under every government. Government at death decides whether to use them: natural single-heir succession fulfills the outcome, elections and appointments keep their existing selection. Other kin are created at succession. Union copies share the same plan. Transaction reconciliation retains exactly the current ruler identities and their immediate planned primaries, at most two plans per distinct reigning person. Realm-copy counts and changed identities avoid scanning all provinces at seating. Transfer, regrouping and merging do not cancel a promise while its person remains reachable. Removal of the last copy cancels an unused promise and any otherwise unreachable primary's descendant promise. Fulfilled outgoing plans are removed without cancellation.

## Dynasties

At world start every sovereign is seated with a new-house age; then, in shuffled order, a realm adopts the dynasty of a random bordering sovereign already assigned with chance `DYNASTY_SEED_CHANCE = 0.13`, else a new dynasty. On the person model 226 of 1,002 starting sovereigns shared a dynasty with a neighbour (22.6%); an adopter and its donor both count, so the adoption share is `f / (2 − f) = 0.127`.

Dynasties spread afterwards through four paths: partition juniors take the late ruler's dynasty; a daughter's line takes a marriage partner's dynasty or the partner's own ruler; a pretender after an inheritance has the late ruler's dynasty; and a personal union gives several realms one ruler. A new house, an appointee, an elected stranger and a usurping protector found a new dynasty at their realm.

## Shared rulers and unions

A union junior carries its senior's columns and has no succession event; only the top senior schedules a shared ruler's death. Every change goes through `STATE.seatRuler`, `unite` or `foundRuler`, which keep exactly one current succession event for each independent realm or union group.

- **Replacing a senior** (usurpation, overthrow) keeps the group only when the incoming dynasty equals the outgoing one: every junior then takes the new ruler and generation counts are unchanged. Otherwise each junior is detached with a fresh ruler of the outgoing shared dynasty, claim 2, an `INHERITED_AGE` draw, its own death draw and a minority regency if needed.
- **Replacing a junior** detaches that junior first, even for a ruler of the same house; the senior and the other juniors keep their ruler, generation counts and schedules.
- **A natural succession** at a senior whose heir is of the same house gives every junior the new ruler and counts one more shared reign; an adjacent junior merges at 3 (`UNION_MERGE_GENERATIONS`). Any other outcome ends the union.
- **A union formed by inheritance or a won claim war** copies the incoming living ruler, with its name origin and death date, across the whole resulting group, including existing juniors, and the senior is chosen by the existing rule (the realm that must lead, else the larger).
- **Government reconciliation** that disallows a union detaches the affected juniors as above. When a senior stops being sovereign, juniors still sharing one ruler continue together under the largest; a lone one keeps its ruler on its own throne.

Every replacement ends the realm's [marriage ties](royal-marriages.md#ending). The history report validates each year that realms sharing a ruler share one union group (`ruler of realms outside one union group`).

## Records and names

The journal carries, for each ruler change, the ruler's naming inputs (`rulerId`, `nameSeed`, `nameOrigin`, `sex`, `dynasty`, `dynastyOrigin`), birth date, a regency flag and, for a ruler who follows a relative, `kin` (the relation and the late ruler's naming inputs, see [record anchors](../people/anchors.md)). Notes that name rulers who have since been replaced (the late ruler of a partition, an interregnum or a succession, a deposed ruler, a usurper) carry immutable snapshots of the same inputs, so no event looks up an old id in mutable columns. `RULER_NAMES` resolves names lazily from those inputs with the world's name generator, with a per-record cache by ruler id; nothing is generated until a page asks.

### Heir plan record contract

Each `heirPlanChange` nation-log event has a required monotonic `transactionId` and three required arrays:

- `created`: owner ruler ref and `birthDate`, `relation`, nullable `heir` (ref and birth date), and `juniors` (refs and birth dates). Relations are `son`, `daughterLine`, `nearKin`, `kinsman`, or `none`. Only `son` has children; it means a direct child of either sex.
- `fulfilled`: late owner's `rulerId`, consumed relation, selected house and claim, and actual successor ref and birth date. It records a completed natural single-heir succession, including one whose successor is replaced again before the transaction ends.
- `cancelled`: owner `rulerId` and reason `unused` for an unused outgoing promise or `unreachable` for an unneeded primary's descendant promise. Cancellation ends the succession promise; it does not delete the children or assert their death.

Creation, fulfillment and cancellation are immutable journal snapshots taken when each action happens. The translator emits one event per originating root per transaction, even if the realm has ended, its ruler columns were cleared, or the owner was an intermediate ruler. Initial seeded plans and initial union cancellations are included. Union copies never duplicate a creation. Engine births pass through `TRANSLATOR.recordTime` and `DATE.timeMsToEu4Date`, just like ruler changes. No payload exposes future death or scheduled succession dates.

Consumers must scan every nation log and key promises by `rulerId`; the carrier realm is not ownership. Group events across logs by `transactionId`, sort by that id, then atomically apply all creations, fulfillments and cancellations in that order, preserving array order. Different heap transactions at the same timestamp have distinct ids. Sending/releasing journals does not reset the sequence. Advancing a record appends events without changing earlier promises. Procedural records require this contract; Earth/imported histories are outside this feature. People-consumer implementation is separate work.

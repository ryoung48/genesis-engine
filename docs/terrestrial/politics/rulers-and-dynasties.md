# Rulers and dynasties

Scope: `:history`.

Every sovereign realm has exactly one ruler and the simulation tracks nobody else. A ruler is a row of per-province columns, meaningful at a sovereign root: no person table, family, birth, marriage, health, trait or opinion exists. [Succession](government-and-succession.md) replaces a ruler by rolling an outcome; [royal marriages](royal-marriages.md) tie realms; [personal unions](personal-unions.md) let one ruler govern several realms.

Code: `src/model/history/sim/engine/state/rulers` (`STATE_RULERS`), seating and unions in `state/index.ts` (`STATE.seatRuler`, `foundRuler`, `unite`), naming in `src/model/history/record/rulers` (`RULER_NAMES`).

## The ruler record

| Column | Meaning |
|---|---|
| `leaderRuntime.rulerId` | Global counter; -1 when the realm has no ruler. A ruler copied onto another throne keeps its id. |
| `leaderRuntime.nameSeed` | Seed of the ruler's given name. |
| `leaderRuntime.nameOrigin` | The province whose language names the ruler: the realm at first seating. |
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

The journal carries, for each ruler change, the ruler's naming inputs (`rulerId`, `nameSeed`, `nameOrigin`, `sex`, `dynasty`, `dynastyOrigin`), birth date and a regency flag. Notes that name rulers who have since been replaced (the late ruler of a partition, an interregnum or a succession, a deposed ruler, a usurper) carry immutable snapshots of the same inputs, so no event looks up an old id in mutable columns. `RULER_NAMES` resolves names lazily from those inputs with the world's name generator, with a per-record cache by ruler id; nothing is generated until a page asks.

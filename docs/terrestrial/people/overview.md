# Simulated people and ruling families

Scope: `:history`.

People are individually simulated rulers, seat holders and their close families: a few thousand people on the default map. They cause realm events. [Population](../population/growth-cities-and-knowledge.md) is the aggregate rural and urban headcount, not a table of these individuals. A person’s attributes, traits and stress are properties of that same person, described by the code API `CHARACTER`, rather than a separate entity.

Code: person model in `src/model/history/sim/people` (`index.ts`, `family/`, `betrothal/`, `fertility/`, `heirs/`, `lifespan/`, `health/`, `log/`); engine wiring in `src/model/history/sim/engine/events/people` (`districts/`, `royal-marriages/`, `patricians/`) and `engine/events/succession` (`systems/`, `partition/`, `regency/`, `restoration/`); unions in `engine/state/index.ts`; record in `src/model/history/record/people`.

## Who is tracked

- **Seat holders.** Sovereign rulers (`rulerOf[root]`), district holders (`rulerOf[seat]`) and the patrician house heads of electoral republics.
- **Their close family.** Spouses, children and siblings. They are generated with the holder and live on in the person table.
- **Everyone else is never created.** Spouses from outside the ruling houses are generated for a fallback proposal, including rejected unmarried outsiders (see [Marriage](marriage-and-alliances.md#marriage)).

Every person the simulation creates is recorded, landed or not, living or dead: see [person records](../mechanics/person-records.md).

## What is tracked per person

`PersonTable` (columns indexed by person id): sex, creation availability, birth and death (years; death is `Infinity` until a date is chosen), father, mother, spouse, dynasty (-1 for none), culture, name seed, home (realm at birth; names come from its culture), residence (current household province), initialResidence (birth-effective province), heldSeats (sorted unique seat IDs), children, marriage time, betrothed partner and betrothal time (-1 without one), base fertility (0.5–0.6, drawn at creation), peak (highest seat standing ever held) and next birth (earliest next conception).

The additional attribute, trait and stress columns are `bases`, `personality`, `grades`, `congenital`, `carried` and `stress`. See [packing and inheritance](attributes-traits-and-stress.md). The ten health columns are listed in [health](health-and-mortality.md#simulation-columns).

State-level maps in `PeopleState`:

| Field | Meaning |
|---|---|
| `rulerOf` | Holder of each seat (sovereign root or district), -1 if empty. `PEOPLE.setRuler` is its only writer. |
| `stressed` | People with positive stress after the preceding annual pass; used to reset former sovereign rulers. |
| `patricians` | 3–5 patrician house heads per electoral republic. |
| `unionGenerations` | Shared successors counted once per actual senior–junior edge and dispatch. |
| `residenceHistory` | Sparse retained effective-time moves and birth corrections, including dead people; independent of the pending log. |
| `household` | Engine-provided territorial-sovereign, rank and time callbacks. |
| `marriageAlliances` | Realm pairs allied by a royal marriage. |
| `regencies` | Realm → `{ ward, cause (minority or incapacity), regent (-1 = council), kind }`. |
| `bereavements` | Deaths of a spouse or child since the last yearly pass, by the bereaved; read and cleared by the stress step. |
| `deliveries` | Pending pregnancies by id and by mother ([families](families-and-lifecycle.md#pregnancy)). |
| `deposed` | Realm → `{ claimant, generation, tried }` for deposed rulers' lines. |
| `log` | Rows appended since the last journal flush, as typed columns, and the cursor of people already sent. See [person records](../mechanics/person-records.md). |

## Yearly order

The yearly `PEOPLE_YEAR` event runs, in order:
1. the stress step for every sovereign ruler, then the deaths of any whose heart failed;
2. the health pass: completed ages, band and condition changes, death projected for the coming year, and regents for the newly Incapable;
3. district inheritance and new grants, the marriage-alliance review (which also breaks betrothals left without an alliance) and patrician upkeep;
4. fulfilled betrothals, then reciprocal foreign/domestic matching and outsider proposals; each accepted pair settles alliances/unions immediately and refreshes opinion contexts and inheritance before the next search;
5. the coming year's conceptions, then the regency review, usurpation rolls and restoration.

Deaths, births, coming of age and rebellions run on their own events at the exact time. [Families](families-and-lifecycle.md) has the order of same-time events.

## Related rules and records

See [families, births and lifespans](families-and-lifecycle.md) for life, pregnancy and house founding; [marriage and family alliances](marriage-and-alliances.md) for partner selection and betrothals; [government and succession](../politics/government-and-succession.md) for districts, heirs, unions and regencies; [household residence](residence-and-realm.md) for location and territorial realm; and [person records](../mechanics/person-records.md#record-and-wiki) for historical queries and wiki presentation.

Directed structural opinions are computed on demand from [opinion and relationships](opinion-and-relationships.md), with no stored pair matrix.

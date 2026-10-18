# Record anchors

The record fixes some facts about rulers; the [cast](overview.md#the-cast) is fitted around them. Facts in the record always win: a ruler's birth, death, sex, dynasty, name, kin relation, heir plan and royal-marriage tie are never generated. Where an existing person makes a record fact impossible to fit, the page says so with a row or the report counts it.

## The `kin` field

Each `rulerChange` payload carries `kin`: the relation of the new ruler to the ruler it follows, and that ruler's naming inputs. The journal derives it from notes already in the same transaction and draws no randomness.

| Source | Relation |
|---|---|
| succession, single heir, house `same`, claim 3 | `son` |
| succession, house `other` (daughter's line) | `daughterLine` |
| succession, house `same`, claim 2 | `nearKin` |
| succession, house `same`, claim 1; election with house `same`; kinsman usurper; pretender of the late dynasty | `kinsman` |
| partition junior heirs | `son` |
| new house, appointment, non-kinsman usurper, regime change, founders, first rulers | none |

A union copy keeps its `rulerId` and its earliest event's `kin`. The pretender takes the late ruler from the succession note of the same transaction. The daughter's line is read from house `other`.

The relation `son` means a direct child of either sex; the culture's gender system still determines sex. Procedural history reserves direct-child identities and births through [early heir plans](../politics/rulers-and-dynasties.md#heir-plan-record-contract): creations, fulfillments and cancellations across all nation logs, ordered atomically by transaction id. Cancellation ends a succession promise, not the existence of its children. Plans expose no future deaths.

## Ruler facts

`INGEST` adds `rulerChange` events one at a time; `ANCHORS` keeps per ruler the birth, sex, name, dynasty, reigns and:

- recorded natural death: the date is fixed and health-driven death is off until then;
- deposition: only the deposition date is anchored, and the death after it is drawn;
- still reigning at `record.maxTimeMs`: no death through the horizon, extended as the record grows;
- realm ended with no recorded death: alive to the last reign date, drawn after.

A reign closed by its nation's death is settled: a later revival of that nation does not move its end date. When a death or deposition arrives for a ruler already in the cast, their life is redrawn with the same seed; if a death was already drawn that disagrees with the record, the drawn death stays and `deathContradictions` counts it.

## Heir plans

A `created` plan names the owner and the planned primary and junior children with identities and births. Each planned child becomes a **reservation** on the owner:

- if the owner is in the cast and a marriage of theirs can bear the birth (alive parents, the mother 16–44 at conception, no pregnancy within the 3-month rest), the child is created there at once;
- if the owner's generated years already pass the conception and no marriage fits, a gap marriage is added (below), or a concubine marriage when a male owner is married to a wife who cannot bear it; if neither fits, the reservation is counted in `reservedUnfit`;
- otherwise it waits: when the owner's marriages are next extended, the search guarantees a marriage active over the conception (a forced marriage a few months before it) and the fertility loop places the child there. Two planned births within three days share one pregnancy as twins.

A plan whose primary is a direct child blocks the owner's marriages from conceiving any free birth between the plan's creation and the primary's birth; a plan with no direct child blocks every free birth after it. Miscarriages and stillbirths still occur. `fulfilled` marks the promise met; `cancelled` ends the succession promise only, and the reserved children remain.

A planned child has mortality off until the plan resolves; if they are not a ruler by then, the mortality turns on from that date.

## Placement ladders

A ruler is created the first time anything asks for them. A ruler already reserved is created with their owner's family. Otherwise the relation is placed at the first step that fits the cast as it is:

- `son`: direct child of the late ruler → younger sibling → nephew or niece → unknown parents;
- `daughterLine`: grandson through a daughter of the late ruler → nephew through a sister → unknown parents;
- `nearKin`: brother if the birth gap is at most 20 years, else nephew; an older successor is an uncle;
- `kinsman`: cousin → uncle → unknown parents.

Fitting a birth into a parent works in this order:

1. **Existing marriage.** One of the parent's marriages that was active at conception, whose wife is 16–44 and alive at the birth, whose husband is alive at conception, with no pregnancy within three months either side.
2. **Reservation.** If the parent's generated years end before the conception, the child is reserved and the parent's marriages are extended to the birth (see above).
3. **Gap marriage.** If the parent's generated years already pass the conception and they have no exclusive marriage in the window, one marriage and a created spouse are added. The father's mother is 17–32 at the birth, the mother's husband 20–40; the created spouse dies before the parent's next marriage; the marriage has no other children. The child, the parent, the spouse and the marriage carry "revealed later".
4. **Next ladder step**, then unknown parents.

A step that needs a linking person (a brother, a daughter, a parent's sibling) creates that person by the same fitting. A nephew or cousin more than about 40 years after their uncle descends through a chain of intermediate generations, 25–35 years apart. A ruler with unknown parents, or with no kin link, gets generated parents. Fallbacks are counted: `relabelShare` per relation counts the share placed below the first step, and `unrecordedParentCount` counts kin rulers left with generated parents.

## Passed over

On a page, each living child of a late ruler who outranks the successor gets a "passed over" row dated at the succession. A child outranks a son-of-the-late successor if they are older and male, or older and of the successor's sex; for elections, appointments and other non-child successors every living adult child (16 or older) is passed over. The rows depend only on the record and the cast's births, so they appear whenever the page is built. `passedOverShare` is rows over living adult children at successions.

## Royal-marriage ties

A tie is registered when `royalMarriageStart` is ingested and filled by the first page after it. For a tie between realms at time t, each side offers candidates, who must be alive, unmarried at t, of age (women 16–44, men 18–69) and not yet generated past t:

- **R**: the ruler;
- **C**: cast children of the ruler aged 16–25;
- **S**: cast siblings born within 10 years of the ruler;
- **I**: a created child or sibling, fitted as above.

Pairs of opposite sex that the religion's [consanguinity bars](families.md#marriages-between-relatives) allow are tried in the order (R,C), (C,R), (R,R), (C,C), then pairs with S, then pairs with I. The marriage lasts until a death; `royalMarriageEnd` ends the alliance only. A tie no pair fits counts toward `unfilledTieShare`. A tie waits until both rulers are in the cast and is then filled when the next page runs, so a page never builds a whole neighbouring dynasty just to realise a wedding.

## Unions

A `rulerChange` that puts an existing ruler on the throne of a late ruler with relation `daughterLine` is a union. The successor's page links it to a marriage to a child of the late ruler at or before the union; if there is none it shows "inherited through the marriage alliance". The report counts the latter as `allianceRows`.

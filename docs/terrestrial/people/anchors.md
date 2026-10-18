# Record anchors

The record fixes some facts about rulers; generated people are fitted around them. Facts in the record always win: a ruler's birth, death, sex, dynasty, name and royal-marriage ties are never generated.

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

The legacy relation `son` means a direct child of either sex; the culture's gender system still determines sex. Procedural history now reserves direct-child identities and births through [early heir plans](../politics/rulers-and-dynasties.md#heir-plan-record-contract). That contract provides creations, completed fulfillments and cancellations across all nation logs, ordered atomically by transaction id. Cancellation ends a succession promise, without deleting a child or asserting a death. Planned records expose no future deaths. This change provides record facts; adapting people consumers to reserve these children is separate work.

## Ruler facts

`ANCHORS.build` makes one pass over the record. Per ruler it keeps birth, sex, name, dynasty, reigns and:

- recorded natural death: the date is fixed and health-driven death is off until then;
- deposition: only the deposition date is anchored, and the death after it is drawn;
- still reigning at `record.maxTimeMs`: no death through the horizon;
- realm ended with no recorded death: alive to the last reign date, drawn after.

## Placement ladders

The ruler-only model draws ages independently, so some recorded relations are impossible. A parent is possible when the mother is 16–45 and alive at the birth and the father is 16 or older and alive at conception (birth minus 280 days). Each relation is placed at the first possible step:

- `son`: direct child of the late ruler → younger sibling → nephew or niece → unknown parents;
- `daughterLine`: grandson through a daughter of the late ruler → nephew through a sister → unknown parents;
- `nearKin`: brother if the birth gap is at most 20 years, else nephew; an older successor is an uncle;
- `kinsman`: cousin → uncle → unknown parents.

Linking people a step needs (a brother, a daughter, a parent's sibling) are injected `A` children of the right couple, conditioned to survive the anchored event. Anchored births skip spacing, cap and Incapable stops. A ruler with no kin link gets generated parents `P`: father 20–40 years older, mother 17–32 years older. The daughter's-line husband is an injected man of the successor's dynasty.

Planning runs in time order over `rulerChange` and `royalMarriageStart` events, so it is deterministic and does not depend on which page opens first. The report records `relabelShare` per relation and the index time as `indexMs`.

## Royal-marriage ties

For a tie between realms at time t, each side's participant is chosen from the record alone, the lower realm id first, which fixes the needed sex on the other side:

1. the ruler, if marriage-eligible by age (women 16–44, men 18–69) and not in another anchored marriage at t;
2. else an injected child of the ruler aged 16–25 at t;
3. else an injected sibling born within 10 years of the ruler.

If neither side can field a participant the tie stays diplomatic only and counts toward `unfilledTieShare`. A filled tie is an anchored marriage that ends with the tie.

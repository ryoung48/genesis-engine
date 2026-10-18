# People generated on demand

The simulation tracks one individual per realm: the ruler (see [rulers and dynasties](../politics/rulers-and-dynasties.md)). Everyone else a wiki page shows is generated when a page asks for them, on the main thread, from the history record. Nothing here runs inside the history simulation, draws from its RNG, or changes its statistics. `src/model/people` imports the record, the world frame and `shared`; nothing under `src/model/history` imports it.

A person page shows sex, age, health band, culture, religion, title, house (or "Lowborn"), personality, congenital traits and old-age conditions. It lists parents, full and half siblings, current and former spouses and children, each with name, sex, age, house, health status and the page person's opinion of them. After the page renders, the same page adds grandparents, uncles and aunts, and first cousins. Its timeline lists births, weddings, widowhood, children's births, pregnancy losses, condition onsets and band changes, deaths of relatives, accession and deposition, passed-over successions, and the person's own death.

## The cast

`CAST.of({ record, context })` is one persistent store per procedural record, kept in a `WeakMap` and never invalidated. It holds every `Person` and `Marriage` generated so far, indexed by a number assigned in creation order (`PersonId`, `MarriageId`), plus the ruler-to-person map, the seat families, the anchor index and the reservations (see [anchors](anchors.md)). The cast is created on the first request and fed by the timeline hook as the record grows. It is not saved across reloads and is not shared between viewers.

**Generated means final.** Within a session, a fact once generated never changes: birth, death, sex, house, marriages and their dates, children, pregnancies, conditions, band changes. The cast only ever appends:

- new events after a person's `generatedUntil`, the date up to which their marriage search and their marriages' children have been generated;
- lives of people still alive at the old horizon, extended with the same seed so every earlier row is identical (a ruler still reigning is drawn with mortality off; the recorded death or deposition arrives later and always lies after the old horizon);
- relatives the record reveals late: a child, and for a gap marriage one marriage and one mother, added inside a window where the existing family has no conflicting pregnancy, marriage or life row. Every touched person, child and marriage carries a "revealed later" mark that pages show.

Click order may change the cast. Determinism across sessions is not required, but every draw is `HASH.unit({ seed, channel, salt })` over the person's seed (the world seed mixed with the `PersonId`), so a person's own life and character are stable once created. Nothing draws from `window.dice`.

Channels: 1–132 character, 200+ congenital, 1000–1040 health, 1100–1141 marriage seeking and spouse choice, 1200–1208 fertility, 1300–1312 fitting and ties, 1400 names.

## Generating on click

`PERSON_QUERY.page` ingests whatever the record gained since the last ingestion, then:

1. resolves the key (`person:<id>`, or `ruler:<rulerId>`, which creates the ruler through the [ladder](anchors.md#placement-ladders) if needed);
2. returns a pending page if the selected date is later than `record.maxTimeMs`, and an unborn page before the person's birth;
3. extends the person's marriages and children to the selected date, creates their parents if they have none, and extends both parents' marriages for full and half siblings;
4. lists everyone shown as a person with identity and life.

`PERSON_QUERY.extended` runs after the page has rendered (the hook shows "Loading extended family"): it ensures both pairs of grandparents exist, extends the grandparents' marriages for uncles and aunts, then extends each uncle and aunt for first cousins.

A person whose parents are missing gets them on demand: father alive at conception, mother alive at birth, aged by the generated-parent gaps in [anchors](anchors.md), with a marriage that covers the child's conception. The couple's other children are generated around the child with the 3-month rest on both sides. These outsiders have the no-parent character rule and an explicit rank, so nothing shown depends on relatives created later.

## Ingestion

`INGEST.apply` reads only the events appended since its last pass, per nation log and in the diplomacy log, and applies them without regenerating anything: new ruler facts, deaths and depositions, heir plans (grouped by transaction id), and royal marriage ties. A yearly batch takes well under a millisecond. Ties are registered at ingestion and filled by the first page after both of their rulers are in the cast. See [anchors](anchors.md).

## Lives

A life is drawn once, at creation, by `HEALTH.life`. Extending it reruns the same function with the same inputs and a later end, so the rows before the old horizon are identical (a test asserts row-for-row identity). A planned child who has not yet ruled has mortality off until the plan resolves.

## Limits

Procedural records only: Earth-import rulers have no `rulerId`. Excluded: diseases and wounds (health changes come only from old age and the five ageing conditions), the six base attributes, Inbred and Pure-blooded, households, second cousins and further, any effect of people on history, "entered holy orders" rows, a persisted or shared cast. Click order shapes the cast. Standing for the child cap is fixed (ruler 3, other house member 3, commoner 1) rather than read from title tiers. A pregnancy's earlier-children count covers the marriage, not the mother's whole life. Culture at birth is read from the frame at the birth year rounded down to 25 years. Regency start and end have no timeline row. A reign's end follows the record's first nation death and is not moved if the nation later returns. The latest record time is incomplete: events at `record.maxTimeMs` may still be appended, so facts at exactly that date can gain rows.

Details: [nobility and the spouse search](nobility.md), [religion and doctrines](religion-and-doctrines.md), [anchors](anchors.md), [health and ageing](health-and-ageing.md), [families](families.md), [character and opinion](character-and-opinion.md).

## Reporting

`pnpm report:people` generates a procedural world with its initial conditions and rulers, then measures people queries at that starting date. It does not advance the simulation. `HISTORY_YEARS` is ignored. World generation uses `HISTORY_SEEDS`, `HISTORY_ERA`, `HISTORY_POINTS`, `HISTORY_START`, `HISTORY_REACH_KM` and `HISTORY_COHESION_STEP`.

The report opens 12 distinct rulers selected deterministically across sex and minor/adult cohorts, and times each page, its extended family and a warm revisit. `PEOPLE_PAGES` can reduce the sample to between 1 and 12 pages. It then forces every kin ruler and every tie into the cast (`placementMs`) to measure `relabelShare` and `unfilledTieShare`; sample statistics are taken before that pass.

| Field | Meaning |
|---|---|
| `pageMs`, `extendedMs`, `warmMs`, `frameMs` | p50 and p95 of the page, the extended family, a revisit, and world-frame time excluded from the page |
| `ingestMs.first` | the first ingestion of the record; the yearly p95 comes from `people-cast.smoke.test.ts` |
| `castSize`, `persons`, `marriages` | cast size after the sample (`persons`) and after the forced pass (`castSize`) |
| `castSpouseShare`, `seatFamilies` | marriages whose spouse was already in the cast, and seat families created |
| `relabelShare`, `placed`, `unfilledTieShare`, `ties` | ladder fallbacks per relation and ties |
| `passedOverShare`, `passedOverRows` | passed-over rows against successions that had a living adult child |
| `revealedLaterCount`, `reservedUnfit`, `unrecordedParentCount`, `allianceRows` | conflict counters |

`PEOPLE_OUT` chooses an exact output file; otherwise reports go to `stats/people/<UTC timestamp>-<PEOPLE_TITLE or people-report>/0.json`. `HISTORY_OUT` does not redirect people output.

`pnpm report:history` performs no people generation and has no `diagnostics.people` or `peopleMs` fields. A people-report failure cannot prevent a separate history report from completing. The standalone people benchmark is excluded from `pnpm test:history`.

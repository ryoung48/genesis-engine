# Person event logging, transfer and historical queries

Scope: `:history`.

This reference owns event encoding, snapshots, buffer transfer and historical ingestion for [simulated people](../people/overview.md). [Household residence](../people/residence-and-realm.md) owns the effective-time location rules.

How people travel from the simulation to the history record. See [household residence](../people/residence-and-realm.md) for effective-time residence rules, [health](../people/health-and-mortality.md) and [families](../people/families-and-lifecycle.md) for the health and lifecycle rows, [simulated people](../people/overview.md) for the rules that create them and [record ownership and memory](record-memory.md) for what the main thread retains.

Code: the log and its codec in `src/model/history/sim/people/log` (`PEOPLE_LOG`); sealing and transfer in `src/model/history/sim/engine/journal` (`JOURNAL.flush`, `JOURNAL.transferList`); ingestion and accessors in `src/model/history/record/people` (`PEOPLE_RECORD`); views in `record/people/query` (`PERSON_QUERY`).

## Who is recorded

Every person the simulation creates, landed or not, living or dead, exactly once. There is no role gate: founders' parents, outsider spouses and siblings who never hold a seat are in the record and have wiki pages.

A person's row is written at the **first journal flush after their creation**, from the person table as it stands at that flush. Starting ancestry and inherited character are final when allocated; health, death and residence are reconciled before the initial flush. Person ids are dense table indices, so the log keeps one cursor (people already sent) and each flush sends the ids from the cursor to the table length in id order. No id can be sent twice, and a role change never creates a row.

**A person's row fields are final at their first flush.** After it, a death arrives as a `death` row, health as `health_band` and `condition` rows, and location changes as `residence` rows. Starting spouses are never reparented. A rule that needs to change a recorded field later must add a row kind for it.

## Rows

`PeopleState.log` is one append buffer of typed columns: time (`Float64Array`), kind (`Uint8Array`) and four `Int32Array` payload slots `a`–`d`, 25 bytes a row. It starts at 4,096 rows and doubles when full. Kinds are a string union at runtime; the numbers are only the transport encoding.

| Kind / code | time | a | b | c | d |
|---|---|---|---|---|---|
| `creation` / 0 | birth | person | father | mother | snapshot index in this packet |
| `death` / 1 | the death | person | cause code | 0 | 0 |
| `wedding` / 2 | marriage start | husband | wife | 0 | 0 |
| `health_band` / 3 | the yearly pass | person | new band code | 0 | 0 |
| `condition` / 4 | the yearly pass, or creation for a starter | person | condition code | old level | new level |
| `seat` / 5 | 0 | seat | holder (−1 if vacated) | seat-kind code | seat-reason code |
| `pregnancy` / 6 | when the pregnancy ends | mother | father | loss-outcome code | 0 |
| `betrothal` / 7 | when made | a | b | 0 | 0 |
| `betrothal_end` / 8 | when released | a | b | end-cause code | 0 |
| `stress` / 9 | when the level changed | person | new level | 0 | 0 |
| `residence` / 10 | effective move or corrected birth | person | province ID | 0 | 0 |
| `opinion_memory` / 11 | refresh (start) | observer | target | reason code | 0 |
| `regent` / 12 | 0 | seat | regent (−1 for a council or the regency's end) | ward | seat-reason code |

- **Time** is simulation years, the unit the person table uses. It is each row's *effective* time. Deaths, pregnancies, weddings and health rows are written when they happen, so their time is never after their transaction's; siblings and house founders are created with past births, so time is still not an ordering key.
- **Seat and regent rows carry no time.** Their time is the enclosing transaction's. Writing it into the column as years would round-trip through a division and could move a tenure boundary.
- **Seat kind** is 0 for a sovereign root (`ruler`) and 1 for a `district`. `sim/people` does not read engine state, so `JOURNAL.flush` passes `PEOPLE_LOG.seal` a `sovereign(seat)` callback and the code is written at the flush, as the object rows derived it before.
- **Codes.** Seat reasons and loss outcomes use explicit codes declared once in `PEOPLE_LOG`; seat reasons include `promotion` 10 and `demotion` 11. Betrothal-end causes are alliance 0, death 1 and kinship 2. Death causes are natural 0, heart 1, battle 2, childbirth 3. Health bands run from Dying 0 to Excellent 5. Conditions are infirm 0, clouded_eyes 1, fragile_bones 2, withering_mind 3, faltering_heart 4, blind 5, incapable 6, with levels 0–4 and −1 for absent; Blind and Incapable are present at 0.
- **One death row per person**, written by the death event when it applies the death. A person created already dead has no death row: their snapshot carries the date.
- **Opinion memory.** Reason codes are aid 0, abandonment 1, attack 2, usurpation 3 and grant 4, owned by `OPINION_MEMORY` beside the strengths so the codec, the evaluator and the record share one table. The row carries no strength: it follows from the reason, and slot `d` must be 0. This replaces the signed initial value the layout once reserved. Append and read both reject an unknown reason, a negative or self endpoint and a non-finite time; read also rejects a non-zero `d`. A row is written for every refresh and none for decay, expiry or pruning. The numbers are unrelated to the heap's event ids.
- **Validation.** `PEOPLE_LOG.append` takes every kind except `creation` and rejects an unknown kind, an unknown code, a non-finite time and a payload outside −1 … 2³¹−1. `PEOPLE_LOG.seal` writes the creation rows and snapshots and rejects a non-finite birth, death or character word, a sex other than 0 or 1, and an out-of-range id or seed. Nothing is truncated silently.

`PEOPLE_LOG.read({ rows, index })` is the one decoder. It returns a kind-tagged row with its codes turned back into the string unions, from either the pending buffer or a sealed packet.

## Order

Rows are in **append order within their transaction**, with the transaction's new people first, so a person's `creation` row precedes any row that names them. Nothing sorts rows by time or relies on time order. Rows stay grouped by journal transaction because tenure times and the "last holder of a seat wins" rule are per transaction, and `JOURNAL.flush` runs after every engine event.

## Packets and transfer

`JournalTransaction.people` is a `PeoplePacket` or null. At each flush `PEOPLE_LOG.seal` writes the pending creation rows, copies the used range of the append buffer into exact-size arrays and resets the buffer's length. A packet is the six row columns plus one snapshot per creation row, indexed by the row's `d`:

| Snapshot column | Type |
|---|---|
| sex | `Uint8Array` |
| death | `Float64Array`: the date for a person already dead when created, else `Infinity` |
| health band | `Uint8Array`: the band when created |
| dynasty, culture, name seed, home, initial residence | `Int32Array` each |
| `bases`, `personality`, `grades`, `congenital`, `carried` | `Float64Array` each |

The required `createdAt` snapshot column adds a `Float64Array` of effective availability times in simulation years. That is 78 bytes a person; birth, father and mother are on the creation row. Its typed columns occupy exactly 25 × rows + 78 × creations bytes; the separate initial-tenure object payload adds structured-clone storage. Initial residence is the birth-effective column, independently of the current location at sealing. Every snapshot buffer, including this column, is transferred.

`JOURNAL.transferList` lists every packet's buffers beside the census buffers, so the worker's `postMessage` moves them to the main thread without copying, and `JOURNAL.releaseSent` drops the packets with their transactions. The append buffer is never transferred, so nothing is detached under the simulation. An empty flush asks `PEOPLE_LOG.pending` and allocates nothing.

Packets are copied to exact size rather than transferred as fixed chunks: a year's rows are tens of kilobytes, and fixed 65,536-row chunks at the worker's yearly publication would retain about 1.5 GB over 933 years.

## Record

`PEOPLE_RECORD.append` folds a packet's rows in append order and keeps no reference to it.

- **Columns.** `PeopleRecord.persons` is dense columns indexed by person id: the snapshot fields plus birth, father and mother, with times converted to record milliseconds, grown by doubling. Health adds four: the snapshot band, the record time it holds from (`Infinity` for someone created dead), the death cause, and the index of the person's latest health row. Ingestion checks that each creation row's id is the number of people already stored. Read people through `PEOPLE_RECORD.count`, `.has`, `.person` (a transient `RecordPerson`), `.birthTimeMs` and `.deathTimeMs`, not through the columns.
- **Derived objects.** `childrenOf`, `marriages`, `marriagesOf`, `tenures` with `tenuresOf`, `tenuresOfSeat`, `regentsOfSeat` and `regentsOfWard`, `dynastyHome`, `pregnanciesOf`, `betrothals`, `betrothalsOf`, `stressOf` and sparse `residencesOf`. Tenures and betrothals have an open end that a later row closes, so they are state folded from rows, not rows.
- **Health rows.** `PeopleRecord.health` is one set of typed columns for every `health_band` and `condition` row in arrival order: time, code (0 for a band, else the condition's code plus one), value (the band, or the level after the change) and the index of the same person's previous row, 17 bytes a row. A person's rows are read by walking that chain back from their latest.
- **Memory refreshes.** `memoriesOf` maps observer to target to that pair's refreshes in arrival order, each a reason and a start in record milliseconds. Nothing is ever removed or overwritten: the record holds refreshes only, and decay is computed at the query. An `opinion_memory` row naming a person the record does not hold is an error, and creation rows precede it in the same packet.
- **Fold.** A `death` row sets the person's death date and cause. A `wedding` closes the pair's standing betrothal as `married`; a `betrothal_end` closes it with its cause. A tenure keeps the reason it started and the reason it ended. A seat that changes hands more than once in one transaction keeps only its last holder, though the first change still closes the tenure that was open; `regent` rows are tracked apart from `seat` rows on the same seat.
- **Ruler death dates.** The translator reads the packet's `death` rows after the append and writes the death date and cause on that person's latest `rulerChange` entry, whichever nation identity holds it. This is the only use of people rows outside the people record. A successor's entry names the predecessor and the cause from the journal's ruler delta, not from people rows.

## Initial tenure evidence

`PeoplePacket.initialTenures` is a dedicated array with person, seat, ruler/district kind, required nullable start, end and reasons. It is structured-cloned with the packet rather than encoded as a runtime seat row. After creation snapshots and before deferred seat changes, ingestion indexes the predecessor's unknown-start interval ending at accession and the current holder's known-start open interval. The ordinary initialization seat row names the same open holder and is skipped, preserving the earlier accession and reason. A later different holder still closes/opens tenures normally.

Unknown starts remain `null` in record and view types. They supply predecessor evidence at their known end, but establish no active holdings, historical role reputation or accession event before it. The person wiki shows previous titles and predecessor links with “start unknown”; known accessions keep their actual date. Prior weddings and death-derived ends reuse the existing marriage indexes. Creation snapshots remain one per final live ID, with append-order historical births, weddings and residence rows.

## Health queries

`PERSON_QUERY.health` returns the latest recorded band at or before the selected time, else the creation snapshot from the time it holds. It returns nothing before a starter's snapshot (no health is known before the simulation began), for the unborn, for the dead and for someone created already dead. `PERSON_QUERY.conditions` folds the condition rows up to the selected time; `.attributes` applies those levels' effects; `.deathCause` is null while the person lives. None of them reads simulation health, XP or any future date.

## Residence queries

Residence rows require a finite effective time, an integer nonnegative province, zero unused slots, an existing person and a time at or after birth. The record keeps effective-time rows with append sequence; lookup chooses the latest effective time no later than selection, then the last appended row on ties. A later-arriving older row does not override a newer move. Never-moved people use initial residence; before birth or before territorial coverage affiliation is unavailable. `PERSON_QUERY.realmAt` follows the selected province’s territorial parent chain into the record nation identity, excluding controllers and diplomatic relations.

The report digest includes initial residence and every retained residence row. Sparse simulation history survives sealing and death so later-created, backdated children can look up their mother’s location at birth.

## Measurements

See [person packet measurements](pipeline-performance.md#person-packet-measurements-p2-schema) for the historical P2 workload and [record memory](record-memory.md#people-record) for retained structure sizes.

## Record and wiki

- **Journal and record.** Each journal transaction carries its people rows as one typed-array packet, and `PEOPLE_RECORD` folds the packets into person columns and the derived marriages, betrothals, tenures, pregnancies and stress rows. [People records](person-records.md) has the row kinds, the packet and the record's structures. A ruler's `rulerChange` entry on the nation timeline gets their death date and cause when they die.
- **Queries.** `PERSON_QUERY` gives the person view, the timeline, the seat holder at a time, the health band, the conditions and the cause of death, all at the selected time and from recorded rows only. On a mother's timeline, "miscarriage" and "stillborn child" are added. The death row reads "died", "died in childbirth", "died of heart failure" or "was killed in battle" by its cause. Conditions add "developed", "worsened", "no longer had", "went blind" and "became incapable" rows. The person page shows Health, Conditions (with levels) and, for the dead, Cause of death. "betrothed", "betrothal broken" for alliance breaks, and "betrothal broken for kinship" for known ancestral intersections are added. The person page shows them as Family rows, and a "Betrothed" chip group while a betrothal stands.
- **Nation timelines.** Only realm-level person events reach them:
  - successions, naming a predecessor who was killed in battle, died of heart failure or died in childbirth;
  - partitions: title shares and district shares, with one Ruler row naming the late ruler, what the primary kept, the realm each junior heir received, and each district that passed to an heir realm;
  - regency start (saying when the ruler could no longer rule), coming of age, regent change and usurpation;
  - marriage alliances (one row per royal marriage and its alliance; the row says "was betrothed to" when the couple had not yet married);
  - unions;
  - pretender and restoration revolts.

  Everything else stays on the person page.
- **Partition wording.** A realm created by a partition reads "Split from X in the partition of [late ruler]'s realm, under [heir]". On person pages a seat taken or lost in one reads "became ruler of Y in the partition of X", "took the seat of Z in the partition of X" or "lost Y in the partition of X". The nation stats show a Succession row: Single heir, Partition, Election or Appointment.

## Attribute and stress queries

Person rows preserve packed innate attributes and traits. Stress rows record level changes and resets; `PERSON_QUERY.attributes`, `.traits` and `.stress` read those properties at the selected date, with personality ages 9/11/13.

## Opinion inputs and creation availability

`HistoryRecord.heritageOfCulture` is a required culture-indexed immutable array. Procedural record construction copies the published `heritages.assignment`; engine initialization owns its separate copy. The existing world partition-buffer transfer moves the published array without detaching the engine array. Absent partitions and Earth records fill unknown entries with −1 (empty when no cultures exist). There are no annual heritage rows.

`createdTimeMs` is converted through the same record-time adapter as birth. Runtime fallback outsiders are unavailable before their actual creation, even though their birth is backdated. Offline ancestors remain available from birth; starter health snapshots remain effective only from initialization, not retroactively. Accepted and rejected runtime outsiders both carry health and condition snapshots, residence and ordinary mortality scheduling. Later participation and death require no wedding.

`PERSON_QUERY.opinion` resolves directed [opinion breakdowns](../people/opinion-and-relationships.md) from selected-time residence religion, active holder tenures, territorial hierarchy, traits, kin and wedding/death intervals. A directed pair's memories at a time are, for each reason, the latest refresh at or before it (arrival order breaks a tie), so a query before a later refresh still sees the earlier one; the same decay helper as the simulation gives each its strength. `PERSON_QUERY.memories` lists them with start and current strength, a faded one at zero; `.memoryPartners` finds everyone a person remembers or is remembered by; `.popularity` enumerates the district tenures held directly of a realm's seat at the date and returns its [noble popularity](../people/opinion-and-relationships.md#district-loyalty-and-noble-popularity). The person page renders both directions for spouses, parents, children, siblings and memory partners. Kinship betrothal releases survive the append codec, packet decoder, structured-clone transfer and record timeline with their original pair IDs and effective time. See [marriage](../people/marriage-and-alliances.md) for matching and diagnostics.

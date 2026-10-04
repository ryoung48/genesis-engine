# People records (`:history`)

How people travel from the simulation to the history record. See [households](households.md) for effective-time residence rules, [people](people.md) for the rules that create them and [history record memory](history-record-memory.md) for what the main thread retains.

Code: the log and its codec in `src/model/history/sim/people/log` (`PEOPLE_LOG`); sealing and transfer in `src/model/history/sim/engine/journal` (`JOURNAL.flush`, `JOURNAL.transferList`); ingestion and accessors in `src/model/history/record/people` (`PEOPLE_RECORD`); views in `record/people/query` (`PERSON_QUERY`).

## Who is recorded

Every person the simulation creates, landed or not, living or dead, exactly once. There is no role gate: founders' parents, outsider spouses and siblings who never hold a seat are in the record and have wiki pages.

A person's row is written at the **first journal flush after their creation**, from the person table as it stands at that flush. It is not captured when the person is created, because `ROYAL_MARRIAGES.seed` rewrites an outsider bride's parents, dynasty, culture, home and name seed and redraws her character afterwards. Person ids are dense table indices, so the log keeps one cursor (people already sent) and each flush sends the ids from the cursor to the table length in id order. No id can be sent twice, and a role change never creates a row.

**A person's row fields are final at their first flush.** After it, death corrections arrive as `death` rows and location changes as `residence` rows. Birth-effective residence corrections preserve the emitted initial snapshot and append a row at birth. Rehoming runs only during initialization, before the initial flush, and the death dates `FAMILY.found` and `outsider` overwrite follow the spawn in the same call. A rule that needs to change a recorded field later must add a row kind for it.

## Rows

`PeopleState.log` is one append buffer of typed columns: time (`Float64Array`), kind (`Uint8Array`) and four `Int32Array` payload slots `a`–`d`, 25 bytes a row. It starts at 4,096 rows and doubles when full. Kinds are a string union at runtime; the numbers are only the transport encoding.

| Kind / code | time | a | b | c | d |
|---|---|---|---|---|---|
| `creation` / 0 | birth | person | father | mother | snapshot index in this packet |
| `death` / 1 | the new death date | person | 0 | 0 | 0 |
| `wedding` / 2 | marriage start | husband | wife | 0 | 0 |
| `health_band` / 3 | reserved | person | old band | new band | 0 |
| `condition` / 4 | reserved | person | condition | old level | new level |
| `seat` / 5 | 0 | seat | holder (−1 if vacated) | seat-kind code | seat-reason code |
| `pregnancy` / 6 | when the pregnancy ends | mother | father | loss-outcome code | 0 |
| `betrothal` / 7 | when made | a | b | 0 | 0 |
| `betrothal_end` / 8 | when released | a | b | end-cause code | 0 |
| `stress` / 9 | when the level changed | person | new level | 0 | 0 |
| `residence` / 10 | effective move or corrected birth | person | province ID | 0 | 0 |
| `opinion_memory` / 11 | reserved | observer | target | reason code | signed initial value |
| `regent` / 12 | 0 | seat | regent (−1 for a council or the regency's end) | ward | seat-reason code |

- **Time** is simulation years, the unit the person table uses. It is each row's *effective* time, not when it was appended, and it is not an ordering key: a pregnancy and the death it causes carry the future due date, and siblings and house founders are created with past births.
- **Seat and regent rows carry no time.** Their time is the enclosing transaction's. Writing it into the column as years would round-trip through a division and could move a tenure boundary.
- **Seat kind** is 0 for a sovereign root (`ruler`) and 1 for a `district`. `sim/people` does not read engine state, so `JOURNAL.flush` passes `PEOPLE_LOG.seal` a `sovereign(seat)` callback and the code is written at the flush, as the object rows derived it before.
- **Codes.** Seat reasons, loss outcomes and betrothal-end causes map to codes in alphabetical order from 0, declared once in `PEOPLE_LOG`. A `death` row means a date moved earlier by childbirth; its `b` is kept at 0 for a later cause code.
- **Reserved kinds** (`health_band`, `condition`, `opinion_memory`) and a non-zero death `b` are rejected. Their payload layouts are fixed in the table so that implementing one adds a codec entry and nothing else.
- **Validation.** `PEOPLE_LOG.append` takes every kind except `creation` and rejects an unknown or reserved kind, an unknown code, a non-finite time and a payload outside −1 … 2³¹−1. `PEOPLE_LOG.seal` writes the creation rows and snapshots and rejects a non-finite birth, death or character word, a sex other than 0 or 1, and an out-of-range id or seed. Nothing is truncated silently.

`PEOPLE_LOG.read({ rows, index })` is the one decoder. It returns a kind-tagged row with its codes turned back into the string unions, from either the pending buffer or a sealed packet.

## Order

Rows are in **append order within their transaction**, with the transaction's new people first, so a person's `creation` row precedes any row that names them. Nothing sorts rows by time or relies on time order. Rows stay grouped by journal transaction because tenure times and the "last holder of a seat wins" rule are per transaction, and `JOURNAL.flush` runs after every engine event.

## Packets and transfer

`JournalTransaction.people` is a `PeoplePacket` or null. At each flush `PEOPLE_LOG.seal` writes the pending creation rows, copies the used range of the append buffer into exact-size arrays and resets the buffer's length. A packet is the six row columns plus one snapshot per creation row, indexed by the row's `d`:

| Snapshot column | Type |
|---|---|
| sex | `Uint8Array` |
| death | `Float64Array` |
| dynasty, culture, name seed, home, initial residence | `Int32Array` each |
| `bases`, `personality`, `grades`, `congenital`, `carried` | `Float64Array` each |

That is 69 bytes a person; birth, father and mother are on the creation row. A packet is exactly 25 × rows + 69 × creations bytes. Initial residence is the birth-effective column, independently of the current location at sealing. Every snapshot buffer, including this column, is transferred.

`JOURNAL.transferList` lists every packet's buffers beside the census buffers, so the worker's `postMessage` moves them to the main thread without copying, and `JOURNAL.releaseSent` drops the packets with their transactions. The append buffer is never transferred, so nothing is detached under the simulation. An empty flush asks `PEOPLE_LOG.pending` and allocates nothing.

Packets are copied to exact size rather than transferred as fixed chunks: a year's rows are tens of kilobytes, and fixed 65,536-row chunks at the worker's yearly publication would retain about 1.5 GB over 933 years.

## Record

`PEOPLE_RECORD.append` folds a packet's rows in append order and keeps no reference to it.

- **Columns.** `PeopleRecord.persons` is dense columns indexed by person id: the snapshot fields plus birth, father and mother, with times converted to record milliseconds, 85 bytes a person, grown by doubling. Ingestion checks that each creation row's id is the number of people already stored. Read people through `PEOPLE_RECORD.count`, `.has`, `.person` (a transient `RecordPerson`), `.birthTimeMs` and `.deathTimeMs`, not through the columns.
- **Derived objects.** `childrenOf`, `marriages`, `marriagesOf`, `tenures` with `tenuresOf`, `tenuresOfSeat`, `regentsOfSeat` and `regentsOfWard`, `dynastyHome`, `pregnanciesOf`, `betrothals`, `betrothalsOf`, `stressOf` and sparse `residencesOf`. Tenures and betrothals have an open end that a later row closes, so they are state folded from rows, not rows.
- **Fold.** A `death` row moves the person's death date. A `wedding` closes the pair's standing betrothal as `married`; a `betrothal_end` closes it with its cause. A tenure keeps the reason it started and the reason it ended. A seat that changes hands more than once in one transaction keeps only its last holder, though the first change still closes the tenure that was open; `regent` rows are tracked apart from `seat` rows on the same seat.
- **Ruler death dates.** The translator reads the packet's `death` rows after the append and moves the death date on a reigning ruler's `rulerChange` entry. This is the only use of people rows outside the people record.

## Residence queries

Residence rows require a finite effective time, an integer nonnegative province, zero unused slots, an existing person and a time at or after birth. The record keeps effective-time rows with append sequence; lookup chooses the latest effective time no later than selection, then the last appended row on ties. A later-arriving older row does not override a newer move. Never-moved people use initial residence; before birth or before territorial coverage affiliation is unavailable. `PERSON_QUERY.realmAt` follows the selected province’s territorial parent chain into the record nation identity, excluding controllers and diplomatic relations.

The report digest includes initial residence and every retained residence row. Sparse simulation history survives sealing and death so later-created, backdated children can look up their mother’s location at birth.

## Measurements

The following measurements describe the P2 schema (65 snapshot bytes and 81 record bytes), before households. Detailed report, seed 14963991, lateMedieval, 204,000 points, 933 years from 867 (`stats/history/2026-10-04T04-48-15-693Z-people-2-dp72/933.json`, `diagnostics.peopleRecord`). Single runs on a shared machine.

| Measure | Value |
|---|---:|
| People created and recorded | 330,956 |
| Rows | 637,416 (1.93 per person) |
| `creation` | 330,956 |
| `seat` | 152,712 |
| `wedding` | 114,976 |
| `pregnancy` | 18,350 |
| `regent` | 9,453 |
| `betrothal` | 4,761 |
| `death` | 4,193 |
| `stress` | 1,216 |
| `betrothal_end` | 799 |
| Packet bytes | 37,447,540 (35.7 MiB; about 40 KB a year) |
| Journal flush, all flushes after the initial one | 6.80 s (6.00 s with object rows) |
| Record ingestion | 0.81 s (0.84 s with object rows) |

The packet bytes are exactly 25 × 637,416 + 65 × 330,956. The flush figure times the whole of `JOURNAL.flush`, not only its people rows, and the two runs' wall times differed by 9% from machine load, so neither timing shows a change. The record built from packets has the same digest (`diagnostics.peopleRecord.sha256`) as the one built from object rows.

The record's memory per structure is measured by `src/test/history-run/retained-memory.smoke.test.ts`; see [history record memory](history-record-memory.md#people-record).

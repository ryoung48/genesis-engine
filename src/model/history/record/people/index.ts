import type {
	AddPersonParams,
	AppendPeopleParams,
	BetrothalPairParams,
	HealthAtParams,
	HealthRowParams,
	PeopleRecord,
	PushIndexParams,
	RecordHealthRow,
	RecordPerson,
	RecordPersonParams,
	ReserveParams,
	SeatChangesParams,
} from "@/model/history/record/people/types"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { RegentRow, SeatRow } from "@/model/history/sim/people/log/types"
import type { DeathCause } from "@/model/history/sim/people/types"

const BYTE_COLUMNS = ["sex", "healthBand", "deathCause"] as const
const INT_COLUMNS = [
	"lastHealth",
	"father",
	"mother",
	"dynasty",
	"culture",
	"nameSeed",
	"home",
	"initialResidence",
] as const
const FLOAT_COLUMNS = [
	"birthTimeMs",
	"deathTimeMs",
	"createdTimeMs",
	"healthTimeMs",
	"bases",
	"personality",
	"grades",
	"congenital",
	"carried",
] as const
const SNAPSHOT_COLUMNS = [
	"sex",
	"healthBand",
	"dynasty",
	"culture",
	"nameSeed",
	"home",
	"initialResidence",
	"bases",
	"personality",
	"grades",
	"congenital",
	"carried",
] as const

function create(): PeopleRecord {
	return {
		persons: {
			count: 0,
			sex: new Uint8Array(0),
			birthTimeMs: new Float64Array(0),
			deathTimeMs: new Float64Array(0),
			father: new Int32Array(0),
			mother: new Int32Array(0),
			dynasty: new Int32Array(0),
			culture: new Int32Array(0),
			nameSeed: new Int32Array(0),
			home: new Int32Array(0),
			initialResidence: new Int32Array(0),
			bases: new Float64Array(0),
			personality: new Float64Array(0),
			grades: new Float64Array(0),
			congenital: new Float64Array(0),
			carried: new Float64Array(0),
			healthBand: new Uint8Array(0),
			createdTimeMs: new Float64Array(0),
			healthTimeMs: new Float64Array(0),
			lastHealth: new Int32Array(0),
			deathCause: new Uint8Array(0),
		},
		health: {
			count: 0,
			timeMs: new Float64Array(0),
			code: new Uint8Array(0),
			value: new Int8Array(0),
			prev: new Int32Array(0),
		},
		memoriesOf: new Map(),
		residencesOf: new Map(),
		stressOf: new Map(),
		childrenOf: new Map(),
		marriages: [],
		marriagesOf: new Map(),
		tenures: [],
		tenuresOf: new Map(),
		tenuresOfSeat: new Map(),
		regentsOfSeat: new Map(),
		regentsOfWard: new Map(),
		dynastyHome: new Map(),
		pregnanciesOf: new Map(),
		betrothals: [],
		betrothalsOf: new Map(),
	}
}

function count(people: PeopleRecord): number {
	return people.persons.count
}

function has({ people, id }: RecordPersonParams): boolean {
	return id >= 0 && id < people.persons.count
}

function person(params: RecordPersonParams): RecordPerson | null {
	if (!has(params)) return null
	const { id } = params
	const persons = params.people.persons
	return {
		id,
		sex: persons.sex[id],
		birthTimeMs: persons.birthTimeMs[id],
		deathTimeMs: persons.deathTimeMs[id],
		father: persons.father[id],
		mother: persons.mother[id],
		dynasty: persons.dynasty[id],
		culture: persons.culture[id],
		nameSeed: persons.nameSeed[id],
		home: persons.home[id],
		initialResidence: persons.initialResidence[id],
		bases: persons.bases[id],
		personality: persons.personality[id],
		grades: persons.grades[id],
		congenital: persons.congenital[id],
		carried: persons.carried[id],
	}
}

// Infinity for a person the record does not hold.
function birthTimeMs(params: RecordPersonParams): number {
	return has(params) ? params.people.persons.birthTimeMs[params.id] : Infinity
}

function deathTimeMs(params: RecordPersonParams): number {
	return has(params) ? params.people.persons.deathTimeMs[params.id] : Infinity
}

function reserve({ persons, count: needed }: ReserveParams): void {
	if (needed <= persons.sex.length) return
	const capacity = Math.max(needed, persons.sex.length * 2)
	for (const column of BYTE_COLUMNS) {
		const grown = new Uint8Array(capacity)
		grown.set(persons[column])
		persons[column] = grown
	}
	for (const column of INT_COLUMNS) {
		const grown = new Int32Array(capacity)
		grown.set(persons[column])
		persons[column] = grown
	}
	for (const column of FLOAT_COLUMNS) {
		const grown = new Float64Array(capacity)
		grown.set(persons[column])
		persons[column] = grown
	}
}

function pushIndex<T>({ index, key, value }: PushIndexParams<T>): void {
	const list = index.get(key)
	if (list) list.push(value)
	else index.set(key, [value])
}

function openBetrothal({ record, a, b }: BetrothalPairParams): number {
	for (const index of record.betrothalsOf.get(a) ?? []) {
		const betrothal = record.betrothals[index]
		if (betrothal.cause === null && (betrothal.a === b || betrothal.b === b))
			return index
	}
	return -1
}

function addPerson(params: AddPersonParams): void {
	const { record, packet, id, snapshot } = params
	const persons = record.persons
	if (id !== persons.count)
		throw new Error(
			`Person ${id} arrived out of order: the record holds ${persons.count} people`,
		)
	for (const column of SNAPSHOT_COLUMNS)
		persons[column][id] = packet[column][snapshot]
	persons.father[id] = params.father
	persons.mother[id] = params.mother
	persons.createdTimeMs[id] = params.createdTimeMs
	persons.birthTimeMs[id] = params.birthTimeMs
	persons.deathTimeMs[id] = params.deathTimeMs
	persons.healthTimeMs[id] =
		params.deathTimeMs === Infinity
			? Math.max(params.birthTimeMs, params.timeMs)
			: Infinity
	persons.lastHealth[id] = -1
	persons.count++
	const dynasty = persons.dynasty[id]
	if (dynasty >= 0 && !record.dynastyHome.has(dynasty))
		record.dynastyHome.set(dynasty, persons.home[id])
	for (const parent of [params.father, params.mother])
		if (parent >= 0)
			pushIndex({ index: record.childrenOf, key: parent, value: id })
}

function pushHealth({
	record,
	person,
	timeMs,
	code,
	value,
}: HealthRowParams): void {
	const rows = record.health
	if (rows.count === rows.timeMs.length) {
		const capacity = Math.max(1024, rows.count * 2)
		const timeColumn = new Float64Array(capacity)
		timeColumn.set(rows.timeMs)
		rows.timeMs = timeColumn
		const codeColumn = new Uint8Array(capacity)
		codeColumn.set(rows.code)
		rows.code = codeColumn
		const valueColumn = new Int8Array(capacity)
		valueColumn.set(rows.value)
		rows.value = valueColumn
		const prevColumn = new Int32Array(capacity)
		prevColumn.set(rows.prev)
		rows.prev = prevColumn
	}
	const index = rows.count++
	rows.timeMs[index] = timeMs
	rows.code[index] = code
	rows.value[index] = value
	rows.prev[index] = record.persons.lastHealth[person]
	record.persons.lastHealth[person] = index
}

// The latest recorded value of one health code at a time; null with no row
// by then.
function healthAt({ people, id, timeMs, code }: HealthAtParams): number | null {
	if (!has({ people, id })) return null
	const rows = people.health
	for (
		let index = people.persons.lastHealth[id];
		index >= 0;
		index = rows.prev[index]
	)
		if (rows.code[index] === code && rows.timeMs[index] <= timeMs)
			return rows.value[index]
	return null
}

// A person's health rows, oldest first.
function healthRows({ people, id }: RecordPersonParams): RecordHealthRow[] {
	if (!has({ people, id })) return []
	const rows = people.health
	const found: RecordHealthRow[] = []
	for (
		let index = people.persons.lastHealth[id];
		index >= 0;
		index = rows.prev[index]
	)
		found.push({
			timeMs: rows.timeMs[index],
			code: rows.code[index],
			value: rows.value[index],
		})
	return found.reverse()
}

function deathCause(params: RecordPersonParams): DeathCause {
	return PEOPLE_LOG.deathCauses[
		has(params) ? params.people.persons.deathCause[params.id] : 0
	]
}

// A seat that changes hands more than once in a transaction keeps only its
// last holder; the first change still closes the tenure that was open.
function changeSeats({ record, rows, timeMs }: SeatChangesParams): void {
	const lastChange = new Map<string, number>()
	for (const [index, row] of rows.entries())
		lastChange.set(`${row.kind}:${row.seat}`, index)
	for (const [index, row] of rows.entries()) {
		const { seat, person: holder, reason } = row
		const regent = row.kind === "regent"
		const ofSeat = regent ? record.regentsOfSeat : record.tenuresOfSeat
		const open = ofSeat.get(seat)?.at(-1)
		if (open !== undefined && record.tenures[open].endTimeMs === Infinity) {
			if (record.tenures[open].person === holder) continue
			record.tenures[open].endTimeMs = timeMs
			record.tenures[open].endReason = reason
		}
		if (holder < 0 || lastChange.get(`${row.kind}:${seat}`) !== index) continue
		const tenureIndex = record.tenures.length
		record.tenures.push({
			person: holder,
			seat,
			kind: regent ? "regent" : row.seatKind,
			ward: regent ? row.ward : -1,
			startTimeMs: timeMs,
			endTimeMs: Infinity,
			startReason: reason,
			endReason: null,
		})
		pushIndex({ index: record.tenuresOf, key: holder, value: tenureIndex })
		pushIndex({ index: ofSeat, key: seat, value: tenureIndex })
		if (regent)
			pushIndex({
				index: record.regentsOfWard,
				key: row.ward,
				value: tenureIndex,
			})
	}
}

// Rows fold in append order. Seat and regent changes only touch tenures, so
// they are applied together once the rest of the packet is in.
function append({
	record,
	packet,
	timeMs,
	recordTime,
}: AppendPeopleParams): void {
	const persons = record.persons
	reserve({ persons, count: persons.count + packet.sex.length })
	const seats: (SeatRow | RegentRow)[] = []
	for (let index = 0; index < packet.count; index++) {
		const row = PEOPLE_LOG.read({ rows: packet, index })
		switch (row.kind) {
			case "creation":
				addPerson({
					record,
					packet,
					id: row.person,
					snapshot: row.snapshot,
					father: row.father,
					mother: row.mother,
					birthTimeMs: recordTime(row.time),
					createdTimeMs: recordTime(packet.createdAt[row.snapshot]),
					deathTimeMs: recordTime(packet.death[row.snapshot]),
					timeMs,
				})
				break
			case "death":
				if (has({ people: record, id: row.person })) {
					persons.deathTimeMs[row.person] = recordTime(row.time)
					persons.deathCause[row.person] = PEOPLE_LOG.deathCauses.indexOf(
						row.cause,
					)
				}
				break
			case "health_band":
				if (has({ people: record, id: row.person }))
					pushHealth({
						record,
						person: row.person,
						timeMs: recordTime(row.time),
						code: 0,
						value: PEOPLE_LOG.healthBands.indexOf(row.band),
					})
				break
			case "condition":
				if (has({ people: record, id: row.person }))
					pushHealth({
						record,
						person: row.person,
						timeMs: recordTime(row.time),
						code: 1 + PEOPLE_LOG.conditions.indexOf(row.condition),
						value: row.after,
					})
				break
			case "pregnancy":
				// A backfilled childbirth death has no death row: the mother was
				// created already dead, and this row carries her cause.
				if (
					row.outcome === "childbirth death" &&
					has({ people: record, id: row.mother })
				)
					persons.deathCause[row.mother] =
						PEOPLE_LOG.deathCauses.indexOf("childbirth")
				pushIndex({
					index: record.pregnanciesOf,
					key: row.mother,
					value: {
						father: row.father,
						timeMs: recordTime(row.time),
						outcome: row.outcome,
					},
				})
				break
			case "betrothal": {
				const betrothal = record.betrothals.length
				record.betrothals.push({
					a: row.a,
					b: row.b,
					startTimeMs: recordTime(row.time),
					endTimeMs: Infinity,
					cause: null,
				})
				pushIndex({ index: record.betrothalsOf, key: row.a, value: betrothal })
				pushIndex({ index: record.betrothalsOf, key: row.b, value: betrothal })
				break
			}
			case "betrothal_end": {
				const betrothal = openBetrothal({ record, a: row.a, b: row.b })
				if (betrothal < 0) break
				record.betrothals[betrothal].endTimeMs = recordTime(row.time)
				record.betrothals[betrothal].cause = row.cause
				break
			}
			case "wedding": {
				const startTimeMs = recordTime(row.time)
				const betrothal = openBetrothal({
					record,
					a: row.husband,
					b: row.wife,
				})
				if (betrothal >= 0) {
					record.betrothals[betrothal].endTimeMs = startTimeMs
					record.betrothals[betrothal].cause = "married"
				}
				const marriage = record.marriages.length
				record.marriages.push({
					husband: row.husband,
					wife: row.wife,
					startTimeMs,
				})
				pushIndex({
					index: record.marriagesOf,
					key: row.husband,
					value: marriage,
				})
				pushIndex({ index: record.marriagesOf, key: row.wife, value: marriage })
				break
			}
			case "residence": {
				const birth = birthTimeMs({ people: record, id: row.person })
				const time = recordTime(row.time)
				if (!Number.isFinite(time) || time < birth || row.province < 0)
					throw new Error("Invalid recorded residence")
				const rows = record.residencesOf.get(row.person) ?? []
				rows.push({
					timeMs: time,
					province: row.province,
					sequence: rows.length,
				})
				rows.sort((a, b) => a.timeMs - b.timeMs || a.sequence - b.sequence)
				record.residencesOf.set(row.person, rows)
				break
			}
			case "stress":
				pushIndex({
					index: record.stressOf,
					key: row.person,
					value: {
						person: row.person,
						timeMs: recordTime(row.time),
						level: row.level,
					},
				})
				break
			case "opinion_memory": {
				if (
					!has({ people: record, id: row.observer }) ||
					!has({ people: record, id: row.target })
				)
					throw new Error("Unknown opinion memory person")
				let targets = record.memoriesOf.get(row.observer)
				if (!targets) {
					targets = new Map()
					record.memoriesOf.set(row.observer, targets)
				}
				pushIndex({
					index: targets,
					key: row.target,
					value: { reason: row.reason, startTimeMs: recordTime(row.time) },
				})
				break
			}
			case "seat":
			case "regent":
				seats.push(row)
				break
		}
	}
	for (const tenure of packet.initialTenures) {
		if (!has({ people: record, id: tenure.person }))
			throw new Error("Unknown initial tenure holder")
		const index = record.tenures.length
		record.tenures.push({
			person: tenure.person,
			seat: tenure.seat,
			kind: tenure.kind,
			ward: -1,
			startTimeMs: tenure.start === null ? null : recordTime(tenure.start),
			endTimeMs: recordTime(tenure.end),
			startReason: tenure.startReason,
			endReason: tenure.endReason,
		})
		pushIndex({ index: record.tenuresOf, key: tenure.person, value: index })
		pushIndex({ index: record.tenuresOfSeat, key: tenure.seat, value: index })
	}
	changeSeats({ record, rows: seats, timeMs })
}

export const PEOPLE_RECORD = {
	create,
	append,
	count,
	has,
	person,
	birthTimeMs,
	deathTimeMs,
	deathCause,
	healthAt,
	healthRows,
}

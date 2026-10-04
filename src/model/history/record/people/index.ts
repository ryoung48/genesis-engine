import type {
	AddPersonParams,
	AppendPeopleParams,
	BetrothalPairParams,
	PeopleRecord,
	PushIndexParams,
	RecordPerson,
	RecordPersonParams,
	ReserveParams,
	SeatChangesParams,
} from "@/model/history/record/people/types"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { RegentRow, SeatRow } from "@/model/history/sim/people/log/types"

const INT_COLUMNS = [
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
	"bases",
	"personality",
	"grades",
	"congenital",
	"carried",
] as const
const SNAPSHOT_COLUMNS = [
	"sex",
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
		},
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
	const sex = new Uint8Array(capacity)
	sex.set(persons.sex)
	persons.sex = sex
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
	persons.birthTimeMs[id] = params.birthTimeMs
	persons.deathTimeMs[id] = params.deathTimeMs
	persons.count++
	const dynasty = persons.dynasty[id]
	if (dynasty >= 0 && !record.dynastyHome.has(dynasty))
		record.dynastyHome.set(dynasty, persons.home[id])
	for (const parent of [params.father, params.mother])
		if (parent >= 0)
			pushIndex({ index: record.childrenOf, key: parent, value: id })
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
					deathTimeMs: recordTime(packet.death[row.snapshot]),
				})
				break
			case "death":
				if (has({ people: record, id: row.person }))
					persons.deathTimeMs[row.person] = recordTime(row.time)
				break
			case "pregnancy":
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
			case "seat":
			case "regent":
				seats.push(row)
				break
		}
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
}

import type { BetrothalEndCause } from "@/model/history/sim/people/betrothal/types"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import type { HealthBand } from "@/model/history/sim/people/health/types"
import type {
	AppendRowParams,
	CodeParams,
	NameParams,
	PeopleLog,
	PeoplePacket,
	PeopleRow,
	PeopleRowKind,
	ReadRowParams,
	SealParams,
	SeatKind,
} from "@/model/history/sim/people/log/types"
import type {
	DeathCause,
	PeopleState,
	PregnancyLoss,
	SeatChangeReason,
} from "@/model/history/sim/people/types"

// A normal yearly pass writes about a thousand rows.
const INITIAL_ROWS = 4096

// Transport codes: a kind's code is its position here.
const KINDS: readonly PeopleRowKind[] = [
	"creation",
	"death",
	"wedding",
	"health_band",
	"condition",
	"seat",
	"pregnancy",
	"betrothal",
	"betrothal_end",
	"stress",
	"residence",
	"opinion_memory",
	"regent",
]
// Kinds whose data does not exist yet.
const RESERVED: ReadonlySet<PeopleRowKind> = new Set(["opinion_memory"])
const CREATION = KINDS.indexOf("creation")
const SEAT = KINDS.indexOf("seat")

const SEAT_REASON_CODE: Record<SeatChangeReason, number> = {
	"district grant": 0,
	partition: 1,
	rebellion: 2,
	"regime change": 3,
	restoration: 4,
	succession: 5,
	"territorial change": 6,
	union: 7,
	unknown: 8,
	usurpation: 9,
}
const SEAT_REASONS = Object.keys(SEAT_REASON_CODE) as SeatChangeReason[]
const LOSS_CODE: Record<PregnancyLoss, number> = {
	"childbirth death": 0,
	miscarriage: 1,
	stillbirth: 2,
}
const LOSSES = Object.keys(LOSS_CODE) as PregnancyLoss[]
const BETROTHAL_END_CODE: Record<BetrothalEndCause, number> = {
	alliance: 0,
	death: 1,
	kinship: 2,
}
const DEATH_CAUSE_CODE: Record<DeathCause, number> = {
	natural: 0,
	heart: 1,
	battle: 2,
	childbirth: 3,
}
const DEATH_CAUSES = Object.keys(DEATH_CAUSE_CODE) as DeathCause[]
const HEALTH_BANDS: readonly HealthBand[] = [
	"Dying",
	"Near death",
	"Poor",
	"Fine",
	"Good",
	"Excellent",
]
const BETROTHAL_ENDS = Object.keys(BETROTHAL_END_CODE) as BetrothalEndCause[]
const SEAT_KINDS: readonly Exclude<SeatKind, "regent">[] = ["ruler", "district"]

function create(): PeopleLog {
	return {
		count: 0,
		time: new Float64Array(INITIAL_ROWS),
		kind: new Uint8Array(INITIAL_ROWS),
		a: new Int32Array(INITIAL_ROWS),
		b: new Int32Array(INITIAL_ROWS),
		c: new Int32Array(INITIAL_ROWS),
		d: new Int32Array(INITIAL_ROWS),
		emitted: 0,
	}
}

function codeOf<T extends string>({ codes, name }: CodeParams<T>): number {
	const code = codes[name]
	if (code === undefined) throw new Error(`Unknown people log code "${name}"`)
	return code
}

function nameOf<T extends string>({ names, code }: NameParams<T>): T {
	const name = names[code]
	if (name === undefined) throw new Error(`Unknown people log code ${code}`)
	return name
}

// Ids, seeds and codes travel as signed 32-bit integers; -1 means none.
function slot(value: number): number {
	if (!Number.isInteger(value) || value < -1 || value > 0x7fffffff)
		throw new Error(`People log value ${value} does not fit a row slot`)
	return value
}

function finite(value: number): number {
	if (!Number.isFinite(value))
		throw new Error(`People log value ${value} is not finite`)
	return value
}

function grow(log: PeopleLog): void {
	const capacity = log.time.length * 2
	const time = new Float64Array(capacity)
	time.set(log.time)
	log.time = time
	const kind = new Uint8Array(capacity)
	kind.set(log.kind)
	log.kind = kind
	for (const column of ["a", "b", "c", "d"] as const) {
		const grown = new Int32Array(capacity)
		grown.set(log[column])
		log[column] = grown
	}
}

function append({ log, row }: AppendRowParams): void {
	const kind = KINDS.indexOf(row.kind)
	if (kind < 0) throw new Error(`Unknown people row kind "${row.kind}"`)
	if (RESERVED.has(row.kind))
		throw new Error(`People row kind "${row.kind}" is reserved`)
	let time = 0
	let a = 0
	let b = 0
	let c = 0
	let d = 0
	switch (row.kind) {
		case "death":
			time = row.time
			a = row.person
			b = codeOf({ codes: DEATH_CAUSE_CODE, name: row.cause })
			break
		case "wedding":
			time = row.time
			a = row.husband
			b = row.wife
			break
		case "seat":
			a = row.seat
			b = row.person
			d = codeOf({ codes: SEAT_REASON_CODE, name: row.reason })
			break
		case "regent":
			a = row.seat
			b = row.person
			c = row.ward
			d = codeOf({ codes: SEAT_REASON_CODE, name: row.reason })
			break
		case "pregnancy":
			time = row.time
			a = row.mother
			b = row.father
			c = codeOf({ codes: LOSS_CODE, name: row.outcome })
			break
		case "betrothal":
			time = row.time
			a = row.a
			b = row.b
			break
		case "betrothal_end":
			time = row.time
			a = row.a
			b = row.b
			c = codeOf({ codes: BETROTHAL_END_CODE, name: row.cause })
			break
		case "residence":
			time = row.time
			a = row.person
			b = row.province
			if (b < 0) throw new Error("Invalid residence location")
			break
		case "stress":
			time = row.time
			a = row.person
			b = row.level
			break
		case "health_band":
			time = row.time
			a = row.person
			b = HEALTH_BANDS.indexOf(row.band)
			if (b < 0) throw new Error(`Unknown health band "${row.band}"`)
			break
		case "condition":
			time = row.time
			a = row.person
			b = AGEING.conditions.indexOf(row.condition)
			if (b < 0) throw new Error(`Unknown condition "${row.condition}"`)
			c = row.before
			d = row.after
			break
		default:
			throw new Error(`People row kind "${KINDS[kind]}" is written at seal`)
	}
	finite(time)
	slot(a)
	slot(b)
	slot(c)
	slot(d)
	if (log.count === log.time.length) grow(log)
	const index = log.count++
	log.time[index] = time
	log.kind[index] = kind
	log.a[index] = a
	log.b[index] = b
	log.c[index] = c
	log.d[index] = d
}

function pending(people: PeopleState): boolean {
	return people.log.count > 0 || people.log.emitted < people.persons.sex.length
}

// People created since the last seal come first, so a person's row precedes
// any row that names them; then the appended rows in append order.
function seal({ people, sovereign }: SealParams): PeoplePacket {
	const { persons: table, log } = people
	const first = log.emitted
	const creations = table.sex.length - first
	const count = creations + log.count
	const packet: PeoplePacket = {
		count,
		time: new Float64Array(count),
		kind: new Uint8Array(count),
		a: new Int32Array(count),
		b: new Int32Array(count),
		c: new Int32Array(count),
		d: new Int32Array(count),
		sex: new Uint8Array(creations),
		createdAt: new Float64Array(creations),
		death: new Float64Array(creations),
		healthBand: new Uint8Array(creations),
		dynasty: new Int32Array(creations),
		culture: new Int32Array(creations),
		nameSeed: new Int32Array(creations),
		home: new Int32Array(creations),
		initialResidence: new Int32Array(creations),
		bases: new Float64Array(creations),
		personality: new Float64Array(creations),
		grades: new Float64Array(creations),
		congenital: new Float64Array(creations),
		carried: new Float64Array(creations),
	}
	for (let index = 0; index < creations; index++) {
		const person = first + index
		const sex: number = table.sex[person]
		if (sex !== 0 && sex !== 1)
			throw new Error(`Person ${person} has sex ${sex}`)
		packet.time[index] = finite(table.birth[person])
		packet.kind[index] = CREATION
		packet.a[index] = slot(person)
		packet.b[index] = slot(table.father[person])
		packet.c[index] = slot(table.mother[person])
		packet.d[index] = index
		packet.sex[index] = sex
		if (Number.isNaN(table.death[person]))
			throw new Error(`Person ${person} has no death date`)
		packet.death[index] =
			table.death[person] <= people.household.time()
				? table.death[person]
				: Infinity
		packet.createdAt[index] = table.createdAt[person]
		packet.healthBand[index] = table.healthFlags[person] & 7
		packet.dynasty[index] = slot(table.dynasty[person])
		packet.culture[index] = slot(table.culture[person])
		packet.nameSeed[index] = slot(table.nameSeed[person])
		packet.home[index] = slot(table.home[person])
		packet.initialResidence[index] = slot(table.initialResidence[person])
		if (
			packet.initialResidence[index] < 0 ||
			packet.initialResidence[index] >= people.rulerOf.length
		)
			throw new Error("Invalid initial residence")
		packet.bases[index] = finite(table.bases[person])
		packet.personality[index] = finite(table.personality[person])
		packet.grades[index] = finite(table.grades[person])
		packet.congenital[index] = finite(table.congenital[person])
		packet.carried[index] = finite(table.carried[person])
	}
	packet.time.set(log.time.subarray(0, log.count), creations)
	packet.kind.set(log.kind.subarray(0, log.count), creations)
	for (const column of ["a", "b", "c", "d"] as const)
		packet[column].set(log[column].subarray(0, log.count), creations)
	for (let index = creations; index < count; index++)
		if (packet.kind[index] === SEAT)
			packet.c[index] = sovereign(packet.a[index]) ? 0 : 1
	log.count = 0
	log.emitted = table.sex.length
	return packet
}

function read({ rows, index }: ReadRowParams): PeopleRow {
	if (!Number.isInteger(index) || index < 0 || index >= rows.count)
		throw new Error(`People row ${index} is outside the ${rows.count} rows`)
	const kind = KINDS[rows.kind[index]]
	const time = rows.time[index]
	const a = rows.a[index]
	const b = rows.b[index]
	const c = rows.c[index]
	const d = rows.d[index]
	switch (kind) {
		case "creation":
			return { kind, time, person: a, father: b, mother: c, snapshot: d }
		case "death":
			return {
				kind,
				time,
				person: a,
				cause: nameOf({ names: DEATH_CAUSES, code: b }),
			}
		case "wedding":
			return { kind, time, husband: a, wife: b }
		case "seat":
			return {
				kind,
				seat: a,
				person: b,
				seatKind: nameOf({ names: SEAT_KINDS, code: c }),
				reason: nameOf({ names: SEAT_REASONS, code: d }),
			}
		case "regent":
			return {
				kind,
				seat: a,
				person: b,
				ward: c,
				reason: nameOf({ names: SEAT_REASONS, code: d }),
			}
		case "pregnancy":
			return {
				kind,
				time,
				mother: a,
				father: b,
				outcome: nameOf({ names: LOSSES, code: c }),
			}
		case "betrothal":
			return { kind, time, a, b }
		case "betrothal_end":
			return {
				kind,
				time,
				a,
				b,
				cause: nameOf({ names: BETROTHAL_ENDS, code: c }),
			}
		case "residence":
			if (b < 0 || c !== 0 || d !== 0 || !Number.isFinite(time))
				throw new Error("Invalid residence row")
			return { kind, time, person: a, province: b }
		case "stress":
			return { kind, time, person: a, level: b }
		case "health_band":
			return {
				kind,
				time,
				person: a,
				band: nameOf({ names: HEALTH_BANDS, code: b }),
			}
		case "condition":
			return {
				kind,
				time,
				person: a,
				condition: nameOf({ names: AGEING.conditions, code: b }),
				before: c,
				after: d,
			}
		default:
			throw new Error(
				`People row kind ${rows.kind[index]} is ${kind === undefined ? "unknown" : "reserved"}`,
			)
	}
}

export const PEOPLE_LOG = {
	deathCauses: DEATH_CAUSES,
	healthBands: HEALTH_BANDS,
	conditions: AGEING.conditions,
	create,
	append,
	pending,
	seal,
	read,
}

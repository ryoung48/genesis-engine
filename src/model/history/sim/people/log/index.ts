import type {
	AppendPeopleLogParams,
	ArrivalRowParams,
	CreatePeopleLogParams,
	DeathCause,
	DrainPeopleLogParams,
	PeopleLogChunk,
	PeopleLogKind,
	PeopleLogRow,
	PeopleLogState,
	PersonIdentity,
	PersonIdentityParams,
	PersonRowParams,
	SeatRowParams,
	WeddingRowParams,
} from "@/model/history/sim/people/log/types"

const KIND: Record<PeopleLogKind, number> = {
	birth: 0,
	death: 1,
	wedding: 2,
	health: 3,
	arrival: 4,
	seat: 5,
}

const KIND_OF_CODE = Object.fromEntries(
	Object.entries(KIND).map(([kind, code]) => [code, kind]),
) as Record<number, PeopleLogKind>

const DEATH_CAUSE_CODES: Record<DeathCause, number> = {
	natural: 0,
	childhood: 1,
	childbirth: 2,
}

const DEATH_CAUSE_OF_CODE = Object.fromEntries(
	Object.entries(DEATH_CAUSE_CODES).map(([cause, code]) => [code, cause]),
) as Record<number, DeathCause>

const CHILDBIRTH_MARK = 1
const CHILD_AGE = 16

function chunk(capacity: number): PeopleLogChunk {
	return {
		count: 0,
		time: new Float64Array(capacity),
		kind: new Uint8Array(capacity),
		a: new Int32Array(capacity),
		b: new Int32Array(capacity),
		c: new Int32Array(capacity),
		d: new Int32Array(capacity),
	}
}

function create({ capacity }: CreatePeopleLogParams): PeopleLogState {
	const size = Math.max(1, Math.min(64000, Math.ceil(capacity)))
	return {
		capacity: size,
		lastTime: Number.NEGATIVE_INFINITY,
		active: chunk(size),
		completed: [],
	}
}

function append({ log, time, kind, a, b, c, d }: AppendPeopleLogParams): void {
	if (time < log.lastTime) throw new Error("People log must be chronological")
	if (log.active.count === log.capacity) {
		log.completed.push(log.active)
		log.active = chunk(log.capacity)
	}
	const i = log.active.count++
	log.active.time[i] = time
	log.active.kind[i] = KIND[kind]
	log.active.a[i] = a
	log.active.b[i] = b
	log.active.c[i] = c
	log.active.d[i] = d
	log.lastTime = time
}

function drain({ log }: DrainPeopleLogParams): PeopleLogChunk[] {
	const result = log.completed
	log.completed = []
	if (log.active.count > 0) {
		const count = log.active.count
		result.push({
			count,
			time: log.active.time.slice(0, count),
			kind: log.active.kind.slice(0, count),
			a: log.active.a.slice(0, count),
			b: log.active.b.slice(0, count),
			c: log.active.c.slice(0, count),
			d: log.active.d.slice(0, count),
		})
		log.active.count = 0
	}
	return result
}

function packIdentity({ dynasty, culture, sex }: PersonIdentity): number {
	return (dynasty << 11) | (culture << 1) | sex
}

function unpackIdentity(packed: number): PersonIdentity {
	return {
		dynasty: packed >>> 11,
		culture: (packed >>> 1) & 1023,
		sex: (packed & 1) as 0 | 1,
	}
}

function identityOf({ persons, person }: PersonIdentityParams): number {
	return packIdentity({
		dynasty: persons.dynasty[person],
		culture: persons.culture[person],
		sex: persons.sex[person] as 0 | 1,
	})
}

function birthRow({ persons, person, time }: PersonRowParams): PeopleLogRow {
	return {
		time,
		kind: "birth",
		a: person,
		b: persons.father[person],
		c: persons.mother[person],
		d: identityOf({ persons, person }),
	}
}

function arrivalRow({
	persons,
	person,
	time,
	ageDays,
}: ArrivalRowParams): PeopleLogRow {
	return {
		time,
		kind: "arrival",
		a: person,
		b: ageDays,
		c: 0,
		d: identityOf({ persons, person }),
	}
}

function healthRow({ persons, person, time }: PersonRowParams): PeopleLogRow {
	return {
		time,
		kind: "health",
		a: person,
		b: persons.health[person],
		c: 0,
		d: 0,
	}
}

function deathCauseOf({ persons, person, time }: PersonRowParams): DeathCause {
	if (persons.deathCause[person] === CHILDBIRTH_MARK) return "childbirth"
	return time - persons.birth[person] < CHILD_AGE ? "childhood" : "natural"
}

function deathRow({ persons, person, time }: PersonRowParams): PeopleLogRow {
	return {
		time,
		kind: "death",
		a: person,
		b: persons.health[person],
		c: DEATH_CAUSE_CODES[deathCauseOf({ persons, person, time })],
		d: 0,
	}
}

function weddingRow({ time, husband, wife }: WeddingRowParams): PeopleLogRow {
	return { time, kind: "wedding", a: husband, b: wife, c: 0, d: 0 }
}

function seatRow({ time, person, seat, gained }: SeatRowParams): PeopleLogRow {
	return { time, kind: "seat", a: person, b: seat, c: gained ? 1 : 0, d: 0 }
}

function kindOf(code: number): PeopleLogKind {
	return KIND_OF_CODE[code]
}

function deathCauseFromCode(code: number): DeathCause {
	return DEATH_CAUSE_OF_CODE[code]
}

export const PEOPLE_LOG = {
	create,
	append,
	drain,
	unpackIdentity,
	birthRow,
	arrivalRow,
	healthRow,
	deathRow,
	weddingRow,
	seatRow,
	kindOf,
	deathCauseFromCode,
	CHILDBIRTH_MARK,
}

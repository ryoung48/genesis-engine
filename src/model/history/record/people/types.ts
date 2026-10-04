import type { BetrothalEndCause } from "@/model/history/sim/people/betrothal/types"
import type {
	PeoplePacket,
	RegentRow,
	SeatKind,
	SeatRow,
} from "@/model/history/sim/people/log/types"
import type { Character } from "@/model/history/sim/people/traits/types"
import type {
	PregnancyLoss,
	SeatChangeReason,
} from "@/model/history/sim/people/types"

export interface RecordPerson extends Character {
	id: number
	sex: number
	birthTimeMs: number
	deathTimeMs: number
	father: number
	mother: number
	dynasty: number
	culture: number
	nameSeed: number
	home: number
	initialResidence: number
}

// Every person, indexed by id. The columns grow by doubling, so their length
// can exceed `count`.
export interface PersonColumns {
	count: number
	sex: Uint8Array
	birthTimeMs: Float64Array
	deathTimeMs: Float64Array
	father: Int32Array
	mother: Int32Array
	dynasty: Int32Array
	culture: Int32Array
	nameSeed: Int32Array
	home: Int32Array
	initialResidence: Int32Array
	bases: Float64Array
	personality: Float64Array
	grades: Float64Array
	congenital: Float64Array
	carried: Float64Array
	// The health band when the person was created, and the record time it
	// holds from: Infinity for someone already dead then.
	healthBand: Uint8Array
	createdTimeMs: Float64Array
	healthTimeMs: Float64Array
	// The person's latest health row; -1 without one.
	lastHealth: Int32Array
	deathCause: Uint8Array
}

// Discrete health changes of every person in arrival order, each linked to
// the same person's previous row.
export interface HealthRows {
	count: number
	timeMs: Float64Array
	// 0 for a health band; otherwise a condition's code plus one.
	code: Uint8Array
	// The band's code, or the condition's level after the change.
	value: Int8Array
	prev: Int32Array
}

export interface RecordMarriage {
	husband: number
	wife: number
	startTimeMs: number
}

// A betrothal that ended in its marriage has the wedding as its end.
export type RecordBetrothalEnd = BetrothalEndCause | "married"

export interface RecordBetrothal {
	a: number
	b: number
	startTimeMs: number
	// Infinity while the betrothal stands.
	endTimeMs: number
	// [JUSTIFICATION] A standing betrothal has no end cause yet.
	cause: RecordBetrothalEnd | null
}

export interface RecordPregnancy {
	father: number
	timeMs: number
	outcome: PregnancyLoss
}

export interface RecordStress {
	person: number
	timeMs: number
	level: number
}

export interface RecordTenure {
	person: number
	seat: number
	kind: SeatKind
	// The child a regent governs for; -1 for other kinds.
	ward: number
	startTimeMs: number
	endTimeMs: number
	startReason: SeatChangeReason
	endReason: SeatChangeReason | null
}

export interface RecordResidence {
	timeMs: number
	province: number
	sequence: number
}

export interface PeopleRecord {
	health: HealthRows
	residencesOf: Map<number, RecordResidence[]>
	stressOf: Map<number, RecordStress[]>
	persons: PersonColumns
	childrenOf: Map<number, number[]>
	marriages: RecordMarriage[]
	marriagesOf: Map<number, number[]>
	tenures: RecordTenure[]
	tenuresOf: Map<number, number[]>
	// Ruler and district tenures of each seat; regents are kept apart.
	tenuresOfSeat: Map<number, number[]>
	regentsOfSeat: Map<number, number[]>
	regentsOfWard: Map<number, number[]>
	// Home realm of each house's first member; house names use it.
	dynastyHome: Map<number, number>
	// Pregnancies that bore no living child or killed the mother, by mother.
	pregnanciesOf: Map<number, RecordPregnancy[]>
	betrothals: RecordBetrothal[]
	betrothalsOf: Map<number, number[]>
}

export interface AppendPeopleParams {
	record: PeopleRecord
	packet: PeoplePacket
	// The transaction's record time; seat and regent rows take it.
	timeMs: number
	recordTime: (years: number) => number
}

export interface RecordPersonParams {
	people: PeopleRecord
	id: number
}

export interface ReserveParams {
	persons: PersonColumns
	count: number
}

export interface AddPersonParams {
	createdTimeMs: number
	record: PeopleRecord
	packet: PeoplePacket
	id: number
	snapshot: number
	father: number
	mother: number
	birthTimeMs: number
	deathTimeMs: number
	// The record time of the transaction that created the person.
	timeMs: number
}

export interface HealthRowParams {
	record: PeopleRecord
	person: number
	timeMs: number
	code: number
	value: number
}

export interface HealthAtParams extends RecordPersonParams {
	timeMs: number
	code: number
}

export interface RecordHealthRow {
	timeMs: number
	// 0 for a health band; otherwise a condition's code plus one.
	code: number
	value: number
}

export interface SeatChangesParams {
	record: PeopleRecord
	rows: (SeatRow | RegentRow)[]
	timeMs: number
}

export interface PushIndexParams<T> {
	index: Map<number, T[]>
	key: number
	value: T
}

export interface BetrothalPairParams {
	record: PeopleRecord
	a: number
	b: number
}

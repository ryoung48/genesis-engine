import type {
	JournalPeople,
	SeatKind,
} from "@/model/history/sim/engine/journal/types"
import type { BetrothalEndCause } from "@/model/history/sim/people/betrothal/types"
import type {
	PregnancyLoss,
	SeatChangeReason,
} from "@/model/history/sim/people/types"

export interface RecordPerson {
	id: number
	sex: number
	birthTimeMs: number
	deathTimeMs: number
	father: number
	mother: number
	dynasty: number
	nameSeed: number
	home: number
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

export interface PeopleRecord {
	persons: Map<number, RecordPerson>
	childrenOf: Map<number, number[]>
	marriages: RecordMarriage[]
	marriagesOf: Map<number, number[]>
	tenures: RecordTenure[]
	tenuresOf: Map<number, number[]>
	// Ruler and district tenures of each seat; regents are kept apart.
	tenuresOfSeat: Map<number, number[]>
	regentsOfSeat: Map<number, number[]>
	regentsOfWard: Map<number, number[]>
	// Home realm of each house's first recorded member; house names use it.
	dynastyHome: Map<number, number>
	// Pregnancies that bore no living child or killed the mother, by mother.
	pregnanciesOf: Map<number, RecordPregnancy[]>
	betrothals: RecordBetrothal[]
	betrothalsOf: Map<number, number[]>
}

export interface AppendPeopleParams {
	record: PeopleRecord
	rows: JournalPeople
	timeMs: number
	recordTime: (engineTimeMs: number) => number
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

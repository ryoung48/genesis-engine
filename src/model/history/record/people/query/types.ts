import type {
	PeopleRecord,
	RecordBetrothalEnd,
} from "@/model/history/record/people/types"
import type {
	Attribute,
	AttributeTier,
} from "@/model/history/sim/people/attributes/types"
import type { SeatKind } from "@/model/history/sim/people/log/types"
import type {
	CongenitalTrait,
	PersonalityTrait,
} from "@/model/history/sim/people/traits/types"
import type { SeatChangeReason } from "@/model/history/sim/people/types"

export interface PersonAtParams {
	people: PeopleRecord
	id: number
	timeMs: number
}

export interface CoupleAtParams {
	people: PeopleRecord
	a: number
	b: number
	timeMs: number
}

export interface SeatAtParams {
	people: PeopleRecord
	seat: number
	timeMs: number
}

export interface SpouseView {
	person: number
	startTimeMs: number
	// [JUSTIFICATION] A marriage still standing at the queried time has no end.
	endTimeMs: number | null
}

export interface BetrothalView {
	person: number
	startTimeMs: number
	// [JUSTIFICATION] A betrothal still standing at the queried time has no end.
	endTimeMs: number | null
	// [JUSTIFICATION] A betrothal still standing at the queried time has no end.
	cause: RecordBetrothalEnd | null
}

export interface TenureView {
	seat: number
	kind: SeatKind
	// The child a regent governs for; -1 for other kinds.
	ward: number
	startTimeMs: number
	// [JUSTIFICATION] A seat still held at the queried time has no end.
	endTimeMs: number | null
	person: number
	startReason: SeatChangeReason
	endReason: SeatChangeReason | null
}

export interface PersonView {
	id: number
	sex: number
	birthTimeMs: number
	// [JUSTIFICATION] The living have no death date yet.
	deathTimeMs: number | null
	father: number
	mother: number
	dynasty: number
	nameSeed: number
	home: number
	spouses: SpouseView[]
	betrothals: BetrothalView[]
	children: number[]
	siblings: number[]
	tenures: TenureView[]
	// Regents who governed for this person as a child ruler.
	regents: TenureView[]
}

export type PersonEventKind =
	| "born"
	| "married"
	| "betrothed"
	| "betrothal broken"
	| "child born"
	| "took seat"
	| "left seat"
	| "became regent"
	| "left regency"
	| "regent appointed"
	| "miscarriage"
	| "stillborn child"
	| "died"
	| "died in childbirth"

export interface PersonEvent {
	timeMs: number
	kind: PersonEventKind
	// Spouse, betrothed, child, seat or regent the event concerns, or the
	// father of a lost pregnancy; -1 for birth and death.
	other: number
	// The tenure a seat or regency event belongs to; -1 for other kinds.
	tenure: number
	// [JUSTIFICATION] Only taking or leaving a seat has a reason, and a seat
	// still held when its holder died has none for its end.
	reason?: SeatChangeReason
}

export interface AttributeView {
	name: Attribute
	value: number
	tier: AttributeTier
}
export interface TraitsView {
	personality: PersonalityTrait[]
	congenital: CongenitalTrait[]
	grades: string[]
}

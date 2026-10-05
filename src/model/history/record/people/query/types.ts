import type { AffiliationRecord } from "@/model/history/record/people/query/affiliation/types"
import type {
	PeopleRecord,
	RecordBetrothalEnd,
} from "@/model/history/record/people/types"
import type { HistoryRecord } from "@/model/history/record/types"
import type {
	Attribute,
	AttributeTier,
} from "@/model/history/sim/people/attributes/types"
import type { HealthCondition } from "@/model/history/sim/people/health/ageing/types"
import type { SeatKind } from "@/model/history/sim/people/log/types"
import type { OpinionMemoryReason } from "@/model/history/sim/people/opinion/memory/types"
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
	startTimeMs: number | null
	// [JUSTIFICATION] A seat still held at the queried time has no end.
	endTimeMs: number | null
	person: number
	startReason: SeatChangeReason
	endReason: SeatChangeReason | null
}

// A health condition a person has at the queried time.
export interface ConditionView {
	condition: HealthCondition
	// 0-4 on an ageing condition's track; 0 for Blind and Incapable.
	level: number
}

export interface PersonView {
	predecessors: TenureView[]
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
	residence: number
	spouses: SpouseView[]
	betrothals: BetrothalView[]
	children: number[]
	siblings: number[]
	tenures: TenureView[]
	// Regents who governed for this person as a child ruler.
	regents: TenureView[]
}

export type PersonEventKind =
	| "moved"
	| "born"
	| "married"
	| "betrothed"
	| "betrothal broken"
	| "betrothal broken for kinship"
	| "child born"
	| "took seat"
	| "left seat"
	| "became regent"
	| "left regency"
	| "regent appointed"
	| "miscarriage"
	| "stillborn child"
	| "condition gained"
	| "condition worsened"
	| "condition lost"
	| "became blind"
	| "became incapable"
	| "died"
	| "died in childbirth"
	| "died of heart failure"
	| "killed in battle"

export interface PersonEvent {
	timeMs: number
	kind: PersonEventKind
	// Spouse, betrothed, child, seat or regent the event concerns, the father
	// of a lost pregnancy, or the code of a health condition; -1 for birth and
	// death.
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

export interface RealmAtParams extends PersonAtParams {
	record: AffiliationRecord
}

export interface OpinionQueryParams extends CoupleAtParams {
	record: HistoryRecord
}

export interface OpinionContextParams {
	people: PeopleRecord
	record: HistoryRecord
	timeMs: number
}

// What one person remembers of another at the queried time. A faded memory
// stays listed with no strength.
export interface MemoryView {
	reason: OpinionMemoryReason
	startTimeMs: number
	strength: number
}

export interface PopularityQueryParams extends SeatAtParams {
	record: HistoryRecord
}

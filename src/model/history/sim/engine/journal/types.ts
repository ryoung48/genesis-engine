import type { CensusKeyframe } from "@/model/history/record/types"
import type {
	EngineNote,
	HistoryState,
	WarGoal,
} from "@/model/history/sim/engine/state/types"
import type { BetrothalEndCause } from "@/model/history/sim/people/betrothal/types"
import type { Character } from "@/model/history/sim/people/traits/types"
import type {
	PregnancyLoss,
	RegentKind,
	SeatChangeReason,
} from "@/model/history/sim/people/types"

interface JournalProvinceChange {
	province: number
	before: number
	after: number
}

export interface JournalRelationChange {
	x: number
	y: number
	before: number
	after: number
}

interface JournalCoalition {
	warId: number
	goal: WarGoal
	attackers: number[]
	defenders: number[]
}

interface JournalRuler {
	root: number
	person: number
	nameSeed: number
	dynasty: number
	birthTimeMs: number
	deathTimeMs: number
	// -1 when no regent, or a regency council, governs.
	regent: number
	regency: RegentKind | null
}

export interface JournalPerson extends Character {
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

export interface JournalMarriage {
	husband: number
	wife: number
	startTimeMs: number
}

export type SeatKind = "ruler" | "district" | "regent"

// A seat (sovereign root or district) changing holder or regent; -1 leaves it
// empty.
export interface JournalSeat {
	seat: number
	person: number
	// A throne is a sovereign root after the event.
	kind: SeatKind
	// The child a regent governs for; -1 for other kinds.
	ward: number
	reason: SeatChangeReason
}

export interface JournalPregnancy {
	mother: number
	father: number
	timeMs: number
	outcome: PregnancyLoss
}

export interface JournalBetrothal {
	a: number
	b: number
	timeMs: number
}

export interface JournalBetrothalEnd extends JournalBetrothal {
	cause: BetrothalEndCause
}

// A recorded person whose death moved earlier.
export interface JournalDeath {
	id: number
	deathTimeMs: number
}

export interface JournalStress {
	person: number
	timeMs: number
	level: number
}

export interface JournalPeople {
	stress: JournalStress[]
	persons: JournalPerson[]
	marriages: JournalMarriage[]
	seats: JournalSeat[]
	deaths: JournalDeath[]
	pregnancies: JournalPregnancy[]
	betrothals: JournalBetrothal[]
	betrothalEnds: JournalBetrothalEnd[]
}

export interface JournalTransaction {
	timeMs: number
	parents: JournalProvinceChange[]
	relations: JournalRelationChange[]
	occupations: JournalProvinceChange[]
	coalitions: JournalCoalition[]
	rulers: JournalRuler[]
	people: JournalPeople
	notes: EngineNote[]
	census: CensusKeyframe | null
}

export interface PendingJournal {
	parents: Map<number, JournalProvinceChange>
	relations: Map<number, JournalRelationChange>
	occupations: Map<number, JournalProvinceChange>
	coalitions: JournalCoalition[]
}

export interface RecordProvinceParams {
	state: HistoryState
	province: number
	before: number
	after: number
}

export interface RecordProvinceChangeParams {
	changes: Map<number, JournalProvinceChange>
	change: RecordProvinceParams
}

export interface RecordRelationParams {
	state: HistoryState
	x: number
	y: number
	before: number
	after: number
}

export interface RecordCoalitionParams {
	state: HistoryState
	warId: number
	goal: WarGoal
	attackers: number[]
	defenders: number[]
}

export interface FlushJournalParams {
	state: HistoryState
	noteCursor: number
	census: boolean
	initial: boolean
}

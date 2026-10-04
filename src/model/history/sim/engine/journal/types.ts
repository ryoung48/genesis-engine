import type { CensusKeyframe } from "@/model/history/record/types"
import type {
	EngineNote,
	HistoryState,
	WarGoal,
} from "@/model/history/sim/engine/state/types"
import type { PeoplePacket } from "@/model/history/sim/people/log/types"
import type { RegentKind } from "@/model/history/sim/people/types"

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

export interface JournalTransaction {
	timeMs: number
	parents: JournalProvinceChange[]
	relations: JournalRelationChange[]
	occupations: JournalProvinceChange[]
	coalitions: JournalCoalition[]
	rulers: JournalRuler[]
	// [JUSTIFICATION] Most transactions carry no people rows, and an empty
	// packet would still allocate and transfer seventeen buffers.
	people: PeoplePacket | null
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

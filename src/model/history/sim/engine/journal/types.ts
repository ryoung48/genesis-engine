import type { CensusKeyframe } from "@/model/history/record/types"
import type {
	HistoryNote,
	HistoryState,
} from "@/model/history/sim/engine/state/types"

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
	rebel: boolean
	attackers: number[]
	defenders: number[]
}

interface JournalRuler {
	root: number
	nameSeed: number
	dynasty: number
	birthTimeMs: number
	deathTimeMs: number
	regent: boolean
}

export interface JournalTransaction {
	timeMs: number
	parents: JournalProvinceChange[]
	relations: JournalRelationChange[]
	occupations: JournalProvinceChange[]
	coalitions: JournalCoalition[]
	rulers: JournalRuler[]
	notes: HistoryNote[]
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
	rebel: boolean
	attackers: number[]
	defenders: number[]
}

export interface FlushJournalParams {
	state: HistoryState
	noteCursor: number
	census: boolean
	initial: boolean
}

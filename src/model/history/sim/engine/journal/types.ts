import type { RulerRef } from "@/model/history/record/rulers/types"
import type { CensusKeyframe } from "@/model/history/record/types"
import type {
	EngineNote,
	HistoryState,
	WarGoal,
} from "@/model/history/sim/engine/state/types"
import type { SerializedRoutes } from "@/model/society/infrastructure/transport/types"

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

export type RulerDeparture = "natural" | "deposed"

interface JournalRuler extends RulerRef {
	root: number
	birthTimeMs: number
	// Whether a regency council governs for a child ruler.
	regency: boolean
	// How the ruler this one replaced left the throne in this transaction;
	// null when nobody left it.
	deathCause: RulerDeparture | null
}

export interface RoadJournal {
	added: SerializedRoutes
	released: SerializedRoutes
}

export interface JournalTransaction {
	roads: RoadJournal | null
	timeMs: number
	parents: JournalProvinceChange[]
	relations: JournalRelationChange[]
	occupations: JournalProvinceChange[]
	coalitions: JournalCoalition[]
	rulers: JournalRuler[]
	notes: EngineNote[]
	census: CensusKeyframe | null
}

export interface PendingJournal {
	roads: RoadJournal | null
	parents: Map<number, JournalProvinceChange>
	relations: Map<number, JournalRelationChange>
	occupations: Map<number, JournalProvinceChange>
	coalitions: JournalCoalition[]
	// Realms whose ruler columns were written since the last flush.
	rulers: Set<number>
}

export interface RecordRulerParams {
	state: HistoryState
	p: number
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

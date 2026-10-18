import type {
	HeirPlanCancelReason,
	PlanRelation,
	RulerHouse,
	RulerKin,
	RulerRef,
} from "@/model/history/record/rulers/types"
import type { CensusKeyframe } from "@/model/history/record/types"
import type { Ruler } from "@/model/history/sim/engine/state/rulers/types"
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
	// [JUSTIFICATION] Founders, appointees and usurpers have no kin to the late ruler.
	kin: RulerKin | null
}

export interface JournalPlannedChild {
	ref: RulerRef
	birthTimeMs: number
}

export interface JournalHeirCreation {
	root: number
	owner: RulerRef
	birthTimeMs: number
	relation: PlanRelation
	heir: JournalPlannedChild | null
	juniors: JournalPlannedChild[]
}

export interface JournalHeirFulfillment {
	root: number
	rulerId: number
	relation: PlanRelation
	house: RulerHouse
	claim: number
	successor: RulerRef
	birthTimeMs: number
}

export interface JournalHeirCancellation {
	root: number
	rulerId: number
	reason: HeirPlanCancelReason
}

export interface RoadJournal {
	added: SerializedRoutes
	released: SerializedRoutes
}

export interface JournalTransaction {
	roads: RoadJournal | null
	// Orders transactions that share a timestamp, across every carrier realm.
	transactionId: number
	timeMs: number
	parents: JournalProvinceChange[]
	relations: JournalRelationChange[]
	occupations: JournalProvinceChange[]
	statuses: JournalProvinceChange[]
	coalitions: JournalCoalition[]
	rulers: JournalRuler[]
	heirCreations: JournalHeirCreation[]
	heirFulfillments: JournalHeirFulfillment[]
	heirCancellations: JournalHeirCancellation[]
	notes: EngineNote[]
	census: CensusKeyframe | null
}

export interface PendingJournal {
	roads: RoadJournal | null
	parents: Map<number, JournalProvinceChange>
	relations: Map<number, JournalRelationChange>
	occupations: Map<number, JournalProvinceChange>
	statuses: Map<number, JournalProvinceChange>
	coalitions: JournalCoalition[]
	// Realms whose ruler columns were written since the last flush.
	rulers: Set<number>
	heirCreations: JournalHeirCreation[]
	heirFulfillments: JournalHeirFulfillment[]
	heirCancellations: JournalHeirCancellation[]
}

export interface KinsParams {
	notes: EngineNote[]
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

export interface RecordHeirPlanParams {
	state: HistoryState
	root: number
	owner: Ruler
	relation: PlanRelation
	primary: Ruler | null
	juniors: Ruler[]
}

export interface RecordHeirFulfilledParams {
	state: HistoryState
	root: number
	rulerId: number
	relation: PlanRelation
	house: RulerHouse
	claim: number
	successor: Ruler
}

export interface RecordHeirCancelledParams {
	state: HistoryState
	root: number
	rulerId: number
	reason: HeirPlanCancelReason
}

export interface PlannedChildParams {
	state: HistoryState
	child: Ruler
}

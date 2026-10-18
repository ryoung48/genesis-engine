import type {
	HeirPlanChange,
	RulerKin,
} from "@/model/history/record/rulers/types"
import type { HistoryRecord } from "@/model/history/record/types"
import type { RulerFact } from "@/model/people/anchors/types"
import type { Cast, PeopleContext } from "@/model/people/cast/types"

export interface OpenParams {
	record: HistoryRecord
	context: PeopleContext
}

export interface ApplyParams {
	cast: Cast
	record: HistoryRecord
}

export interface RulerEvent {
	nationId: number
	timeMs: number
	payload: Record<string, unknown>
}

export interface PlanEvent {
	timeMs: number
	payload: HeirPlanChange
}

export interface Batch {
	rulers: RulerEvent[]
	plans: PlanEvent[]
}

export interface PlanParams {
	cast: Cast
	timeMs: number
	change: HeirPlanChange
}

export interface KinSonParams {
	cast: Cast
	fact: RulerFact
	kin: RulerKin
}

export interface RulerParams {
	cast: Cast
	rulerId: number
}

export interface ResolveParams {
	cast: Cast
	ownerId: number
	timeMs: number
}

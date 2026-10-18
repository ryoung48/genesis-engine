import type { RulerHouse } from "@/model/history/record/rulers/types"
import type { Ruler } from "@/model/history/sim/engine/state/rulers/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface HeirOutcome {
	chance: number
	house: RulerHouse
	claim: number
	daughterLine: boolean
	son: boolean
}

export interface HeirPlan {
	// Realm the plan was rolled for, which carries its record events.
	root: number
	owner: Ruler
	outcome: HeirOutcome
	primary: Ruler | null
	juniors: Ruler[]
	fulfilled: boolean
}

export type PlanCohort = "seated" | "primary"

export interface PlanLead {
	ownerId: number
	primary: boolean
	years: number
}

export interface HeirPlanStats {
	rolled: number
	sonRolls: number
	fertilityRejections: number
	cancelledUnused: number
	cancelledUnreachable: number
	retainedPeak: number
	accessionAges: number[]
	leads: PlanLead[]
	seatedCohorts: Map<number, PlanCohort>
	missingPlans: number
	unreachablePlans: number
	biologyViolations: number
	identityViolations: number
}

export interface EnsureParams {
	state: HistoryState
	ruler: Ruler
	p: number
	rng: SharedRng
}

export type RollParams = EnsureParams

export interface ReadPlanParams {
	state: HistoryState
	rulerId: number
}

export interface FulfillParams {
	state: HistoryState
	plan: HeirPlan
	house: RulerHouse
	claim: number
	successor: Ruler
}

export interface PlanParams {
	state: HistoryState
	plan: HeirPlan
}

export interface RetainedParams {
	state: HistoryState
	id: number
}

export interface PrunePending {
	id: number
	reason: "unused" | "unreachable"
}

export interface OutcomeRngParams {
	rng: SharedRng
}

export interface DrawJuniorsParams {
	state: HistoryState
	parent: Ruler
	primary: Ruler
	p: number
	rng: SharedRng
}

export type RecordLeadsParams = PlanParams

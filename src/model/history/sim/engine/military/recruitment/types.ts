import type { HistoryState } from "@/model/history/sim/engine/state/types"

export type RecruitmentType = "levy" | "regular"

export interface Troops {
	levy: number
	regular: number
}

export interface RecruitmentLimits {
	budget: boolean
	population: boolean
	logistics: boolean
}

export interface RecruitmentTargets extends Troops {
	safety: number
	knee: number
	limits: RecruitmentLimits
	uncapped: Troops
	levyEligibility: number
	funding: number
	budget: number
	remainingBudget: number
	home: Troops
	campaign: Troops
	ships: number
	crew: number
	shipHome: number
	shipCampaign: number
	fleetCost: number
	militaryBudget: number
}

export interface RealmTargetCacheEntry {
	inputs: TargetParams
	targets: RecruitmentTargets
}

export interface MilitaryInterval {
	time: number
	targets: Troops
	rates: Troops
	home: Troops
	campaign: Troops
	mobilized: Troops
	pending: Troops
	reference: Troops
	recruited: Troops
	casualties: Troops
	demobilized: Troops
	settled: Troops
}

export interface NationParams {
	state: HistoryState
	nation: number
}

export interface InitializeTroopsParams extends NationParams {
	target: RecruitmentTargets
}

export interface TargetParams {
	manpower: number
	coastalManpower: number
	tribal: boolean
	knowledge: number
	surplus: number
	outputPerHead: number
	navalShare: number
}

export interface ReconcileParams {
	holdings: Troops
	targets: RecruitmentTargets
}

export interface TerritoryTargetParams extends NationParams {
	provinces: number[]
}

export interface StateParams {
	state: HistoryState
}

export interface MilitaryTotals {
	recruited: Troops
	casualties: Troops
	demobilized: Troops
	settled: Troops
	levyReplacementsAtWar: number
	fiscalDiscrepancy: number
}

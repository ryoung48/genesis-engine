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
	logistics: number
	limits: RecruitmentLimits
	uncapped: Troops
	levyEligibility: number
	funding: number
	budget: number
	remainingBudget: number
	home: Troops
	campaign: Troops
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

export interface TargetParams {
	population: number
	tribal: boolean
	knowledge: number
	surplus: number
	outputPerHead: number
}

export interface RecoveryParams {
	holdings: number
	target: number
	rate: number
	years: number
}

export interface RecoveryResult {
	holdings: number
	replacements: number
	soldierYears: number
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

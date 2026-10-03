import type {
	MilitaryTotals,
	Troops,
} from "@/model/history/sim/engine/military/recruitment/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface RecruitmentCohort {
	realms: number
	population: number
	enrolled: Troops
	deployed: Troops
	regularShare: number
	medianRegularShare: number
	actualLevyPopulationShare: number
	levyEligibility: number
	fundingCommitment: number
	remainingReadinessBudget: number
	ceilingBindings: number
	logisticsBindings: number
	logisticsLimitedRealms: number
	treasuryDebt: number
}

export interface RecruitmentRealm {
	nation: number
	government: string
	knowledge: number
	population: number
	surplus: number
	enrolled: Troops
	deployed: Troops
	targets: Troops
	uncappedTargets: Troops
	logisticsLimit: number
	levyEligibility: number
	funding: number
	remainingBudget: number
	treasury: number
	pending: Troops
	safetyBinding: boolean
	logisticsBinding: boolean
	logisticsLimited: boolean
}

export interface RecruitmentSnapshot {
	year: number
	totals: MilitaryTotals
	pending: Troops
	world: RecruitmentCohort
	cohorts: Record<string, RecruitmentCohort>
	top: RecruitmentRealm[]
	concentrationTop20: number
	lateKnowledgeBand: number
}

export interface SnapshotParams {
	engine: HistoryState
	lateKnowledgeBand: number
}

export interface CohortParams {
	realms: RecruitmentRealm[]
}

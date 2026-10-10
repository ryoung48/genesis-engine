import type { AttackEndReason } from "@/model/history/distribution/attacks/types"
import type { DistributionEngine } from "@/model/history/distribution/engine/types"
import type { PmfDiagnostic } from "@/model/history/distribution/targets/types"
export interface SnapshotParams {
	engine: DistributionEngine
}
export interface DistributionSnapshot {
	year: number
	count: number
	mass: number
	mean: number
	maximum: number
	ceiling: number
	countryTV: number
	territoryTV: number
	countError: number
	steeringLoss: number
	rawCountryTV: number
	rawTerritoryTV: number
	targetCount: number
	targetMean: number
	applicable: boolean
	countryShares: number[]
	territoryShares: number[]
	targetCountryShares: number[]
	targetTerritoryShares: number[]
	activeAttacks: number
	maximumIncoming: number
	meanGain: number
	meanBias: number
	gainQuantiles: { p50: number; p90: number }
	biasQuantiles: { p50: number; p90: number }
	meanAttackerRatio: number
	opportunities: number
	suppressed: number
	captureDraws: number
	blockedFronts: number
	meanCompletionRatio: number
	rejectedFronts: number
	rejectedCapacity: number
	endReasons: Record<AttackEndReason, number>
	projectionSummary: {
		capacity: number
		ceiling: number
		count: number
		continuousMean: number
		objective: number
		fits: PmfDiagnostic[]
	}[]
	declared: number
	ended: number
	mutations: number
	splits: number
	absorptions: number
	connectivityScans: number
	connectivityMs: number
	tendrilShare: number
	invariants: {
		ownership: number
		connectivity: number
		capitals: number
		lifecycle: number
	}
}

export interface DistanceParams {
	before: number[]
	after: number[]
}

export interface AverageParams {
	values: number[]
}

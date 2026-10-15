import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface LandReport {
	year: number
	habitableProvinces: number
	statusShares: {
		uninhabited: number
		stateless: number
		stateHeld: number
	}
	stateHeldTarget: number
	bucketShares: number[]
	bucketTargets: number[]
	sovereignShares: number[]
	totalVariation: number
	absorptions: number
	absorptionViolations: number
	settlements: number
	unmetDemand: number
}

export interface LandTracker {
	absorptions: number
	settlements: number
}

export interface LandSnapshotParams {
	engine: HistoryState
	tracker: LandTracker
}

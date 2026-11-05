import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface LandReport {
	year: number
	habitableProvinces: number
	statusShares: {
		uninhabited: number
		stateless: number
		stateHeld: number
	}
	development: number[]
	knowledge: number[]
	population: {
		stateHeld: number
		stateless: number
	}
	largestCity: number
	stateHeldTarget: number
	bucketShares: number[]
	bucketTargets: number[]
	sovereignShares: number[]
	totalVariation: number
	absorptions: number
	absorptionViolations: number
	settlements: number
	unmetDemand: number
	landmasses: LandmassStatus[]
	heldCores: number
}

export interface LandmassStatus {
	landmass: number
	habitableShare: number
	heldShare: number
	shareOfHeld: number
	cradles: number
}

export interface LandmassContext {
	landmassId: Int32Array
	cradleProvinces: number[]
}

export interface LandmassBreakdownParams {
	engine: HistoryState
	context: LandmassContext
}

export interface LandTracker {
	absorptions: number
	settlements: number
}

export interface LandSnapshotParams {
	engine: HistoryState
	tracker: LandTracker
	landmass: LandmassContext
}

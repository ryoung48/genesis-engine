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
	gaps: GapStatus
}

export interface GapStatus {
	heldSuitability: number
	statelessSuitability: number
	goodStatelessShare: number
}

export interface LandmassStatus {
	landmass: number
	habitableShare: number
	heldShare: number
	shareOfHeld: number
	cradles: number
	contactYear: number
	gaps: GapStatus
}

export interface LandmassContext {
	landmassId: Int32Array
	cradleProvinces: number[]
	contactYear: Int32Array
	suitability: Float32Array
}

export interface GapStatusParams {
	held: number[]
	stateless: number[]
	threshold: number
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

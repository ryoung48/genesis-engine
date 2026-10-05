import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface LiveOpinionContextParams {
	state: HistoryState
	// Simulation years.
	time: number
}

// Running totals of how politics consumed personal opinion.
export interface OpinionPoliticsTotals {
	contextBuilds: number
	marriageCacheMisses: number
	loyaltyEvaluations: number
	loyaltyMs: number
	driftCalls: number
	// Drift calls whose two governors gave a non-zero bias.
	driftBiased: number
	driftMs: number
	// Bias in [-1,-0.5), [-0.5,0), exactly 0, (0,0.5] and (0.5,1].
	driftBands: number[]
	driftBias: number
	// Expected ladder steps per call, summed, before and after the tilt.
	driftOriginalStep: number
	driftTiltedStep: number
}

import type { HistoryState } from "@/model/history/generated/state/types"

interface HistoryFrameBuildProfile {
	hierarchyMs: number
	provinceFieldsMs: number
	warsMs: number
	summaryMs: number
	relationsMs: number
	totalMs: number
}

export interface BuildHistoryFrameParams {
	state: HistoryState
	// [JUSTIFICATION] Optional: the overwhelmingly common caller wants the
	// live edge (state.time) and the field getters already default there via
	// their own `time = state.time`. Only the scrubber passes an explicit
	// past time to reconstruct a historical frame from the field timelines.
	time?: number
	// [JUSTIFICATION] Optional: only the worker's profiling path collects
	// per-phase timings; every other caller discards them.
	profile?: HistoryFrameBuildProfile
}

import type { HistoryState } from "@/model/history/state/types"

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
	profile?: HistoryFrameBuildProfile
}

import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface PendingSuccession {
	revision: number
	due: number
	status: "pending" | "processing"
}

export interface SuccessionSchedule {
	pending: Map<number, PendingSuccession>
	revisions: Map<number, number>
	accountedEdges: Set<string>
	processing: number
}

export interface ScheduleParams {
	state: HistoryState
	person: number
}

export interface ConsumeParams extends ScheduleParams {
	revision: number
}

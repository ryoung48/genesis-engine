import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { DeathCause } from "@/model/history/sim/people/types"

export interface PendingDeath {
	revision: number
	due: number
	cause: DeathCause
	status: "pending" | "processing"
}

export interface DeathSchedule {
	pending: Map<number, PendingDeath>
	revision: number
	// One byte per person: their death has been applied.
	done: Uint8Array
	// People below this id have been offered to the schedule.
	offered: number
	processing: number
}

export interface ScheduleParams {
	state: HistoryState
	person: number
}

export interface EnsureParams extends ScheduleParams {
	cause: DeathCause
}

export interface ConsumeParams extends ScheduleParams {
	revision: number
}

export interface ScheduleStateParams {
	state: HistoryState
}

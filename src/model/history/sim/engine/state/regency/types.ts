import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface EndParams {
	state: HistoryState
	realm: number
	cause: RegencyEndCause
}

export type RegencyEndCause =
	| "government"
	| "age"
	| "death"
	| "usurpation"
	| "lost"
	| "overthrown"

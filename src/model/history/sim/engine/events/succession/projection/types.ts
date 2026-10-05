import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface ProjectionParams {
	state: HistoryState
}

export interface AwardParams {
	state: HistoryState
	standing: Map<number, number>
	share: ProjectedSeat
}

export interface ProjectedSeat {
	heir: number
	seat: number
}

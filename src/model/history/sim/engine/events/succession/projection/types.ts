import type { PartitionShare } from "@/model/history/sim/engine/events/succession/partition/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface ProjectionParams {
	state: HistoryState
}

export interface AwardParams {
	state: HistoryState
	standing: Map<number, number>
	share: PartitionShare
}

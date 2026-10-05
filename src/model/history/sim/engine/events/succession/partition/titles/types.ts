import type { PartitionShare } from "@/model/history/sim/engine/events/succession/partition/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface AllocateTitleSharesParams {
	state: HistoryState
	realm: number
	heirs: number[]
}

export interface TitleAllocation {
	shares: PartitionShare[]
	allocated: Set<number>
	remaining: number[]
}

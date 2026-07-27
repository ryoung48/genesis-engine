import type {
	EarthHistoryData,
	FoldedState,
} from "@/model/history/earth/fold/types"

export interface CheckpointCache {
	data: EarthHistoryData
	provinceIds: string[]
	nationTags: string[]
	checkpoints: Map<number, FoldedState>
}

export interface FoldAtCheckpointParams {
	cache: CheckpointCache
	time: number
}

import type { HistoryRecord } from "@/model/history/record/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
export type HistoryPipeline = "simulation" | "distribution"
export interface BuildProceduralStateParams {
	world: SerializedGenesisWorld
	startTimeMs: number
	pipeline: HistoryPipeline
}

export interface AttachNamesParams {
	record: HistoryRecord
	world: SerializedGenesisWorld
}

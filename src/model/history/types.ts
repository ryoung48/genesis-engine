import type { HistoryRng } from "@/model/history/history-rng/types"
import type { HistoryState } from "@/model/history/state/types"
import type { StageTiming } from "@/model/pipelines/types"
import type { GenesisNationHierarchy } from "@/model/society/types"

export interface SeedColonyRelationsParams {
	state: HistoryState
	nations: GenesisNationHierarchy | undefined
}

export interface ProcessEventsUntilParams {
	state: HistoryState
	targetTime: number
	rng: HistoryRng
	validate: boolean
}

export interface TimedParams<T> {
	label: string
	timings: StageTiming[] | undefined
	fn: () => T
}

export interface SimulateUntilParams {
	state: HistoryState
	targetTimeMs: number
	rng: HistoryRng
	validate: boolean
}

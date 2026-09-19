import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface HierarchyDepthsParams {
	state: HistoryState
}

export interface UrbanizationParams {
	state: HistoryState
	init: boolean
}

export interface DevelopmentParams {
	state: HistoryState
	init: boolean
}

export interface InitPopulationParams {
	state: HistoryState
}

export interface RunPopulationParams {
	state: HistoryState
	previousTime: number
}

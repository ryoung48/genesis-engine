import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { UrbanizationResult } from "@/model/society/urbanization/types"

export interface UrbanizationParams {
	state: HistoryState
	yearFraction: number
}

export interface DevelopmentParams {
	state: HistoryState
}

export interface InitPopulationParams {
	state: HistoryState
	urbanization: UrbanizationResult
}

export interface RunPopulationParams {
	state: HistoryState
	previousTime: number
}

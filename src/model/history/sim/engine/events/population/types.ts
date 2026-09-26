import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface UrbanizationParams {
	state: HistoryState
	init: boolean
	yearFraction: number
}

export interface CityTargetsParams {
	state: HistoryState
	sorted: number[]
	sizes: number[]
	init: boolean
	realmPopulation: number
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

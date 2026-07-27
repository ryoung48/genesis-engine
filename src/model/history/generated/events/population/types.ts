import type { HistoryState } from "@/model/history/generated/state/types"

export interface NationProfile {
	U: number
	q: number
}

export interface RankSizeCitiesParams {
	urbanPop: number
	q: number
}

export interface LerpScaleParams {
	domain: number[]
	range: number[]
	v: number
}

export interface HierarchyDepthParams {
	state: HistoryState
	province: number
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

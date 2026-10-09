import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface InitKnowledgeParams {
	state: HistoryState
}

export interface AdvanceKnowledgeParams {
	state: HistoryState
	yearFraction: number
	ownFactor: (sovereign: number) => number
}

export interface KnowledgeLevelParams {
	knowledge: number
}

export interface LogisticsScaleParams {
	knee: number
	troops: number
}

export interface PopulationMeanParams {
	state: HistoryState
	provinces: Iterable<number>
	values: Float32Array
}

export interface RealmKnowledgeParams {
	state: HistoryState
	provinces: Iterable<number>
}

export interface MaxCitySizeParams {
	knowledge: number
	realmPopulation: number
}

export interface OwnAdvanceParams {
	knowledge: number
	worldKnowledge: number
	development: number
}

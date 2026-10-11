import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SocietyEra } from "@/model/society/types"

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

export interface StartBaselineParams {
	era: SocietyEra
	startYear: number | undefined
}

export interface UrbanKnowledgeParams {
	era: SocietyEra
	baseline: number
}

export interface KnowledgeSpinUp {
	origin: number
	years: number
}

export interface SovereignsParams {
	state: HistoryState
}

export interface FillLiveParams {
	state: HistoryState
	value: number
}

export interface StepParams {
	state: HistoryState
	current: Float32Array
	next: Float32Array
	sovereign: Int32Array
	yearFraction: number
	worldKnowledge: number
	ownFactor: (sovereign: number) => number
}

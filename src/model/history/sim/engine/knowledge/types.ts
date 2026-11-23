import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SocietyEra } from "@/model/society/types"

export interface InitKnowledgeParams {
	state: HistoryState
}

export interface AdvanceKnowledgeParams {
	state: HistoryState
	yearFraction: number
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

export interface StartBaselineParams {
	era: SocietyEra
	startYear: number | undefined
}

export interface KnowledgeSpinUp {
	origin: number
	years: number
}

export interface SovereignsParams {
	state: HistoryState
}

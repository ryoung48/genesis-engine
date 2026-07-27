import type { HistoryRng } from "@/model/history/history-rng/types"
import type { Relation } from "@/model/history/state"
import type { HistoryState } from "@/model/history/state/types"

export interface RollTransitionParams {
	current: Relation
	rng: HistoryRng
}

export interface CanBeRivalsParams {
	state: HistoryState
	a: number
	b: number
}

export interface CanVassalizeParams {
	state: HistoryState
	a: number
	b: number
}

export interface SyncVassalRelationsParams {
	state: HistoryState
	vassal: number
	overlord: number
}

export interface ProcessVassalDiplomacyParams {
	state: HistoryState
	vassal: number
	overlord: number
	rng: HistoryRng
}

export interface ProcessPersonalUnionDiplomacyParams {
	state: HistoryState
	junior: number
	senior: number
	rng: HistoryRng
}

export interface NextEventParams {
	state: HistoryState
	province: number
	rng: HistoryRng
	years?: number
}

export interface ClassifyInitialNeighborRelationParams {
	state: HistoryState
	a: number
	b: number
	rng: HistoryRng
}

export interface SeedNeighborRelationsParams {
	state: HistoryState
	rng: HistoryRng
}

export interface SeedInitialVassalsParams {
	state: HistoryState
	rng: HistoryRng
}

export interface SeedSharedDynastiesParams {
	state: HistoryState
	rng: HistoryRng
}

export interface SeedInitialPersonalUnionsParams {
	state: HistoryState
	rng: HistoryRng
}

export interface InitDiplomacyParams {
	state: HistoryState
	rng: HistoryRng
}

export interface RunDiplomacyParams {
	state: HistoryState
	nation: number
	rng: HistoryRng
}

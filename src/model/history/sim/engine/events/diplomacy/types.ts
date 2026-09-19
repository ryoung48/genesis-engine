import type { Relation } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface RollTransitionParams {
	current: Relation
	rng: SharedRng
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
	rng: SharedRng
}

export interface ProcessPersonalUnionDiplomacyParams {
	state: HistoryState
	junior: number
	senior: number
	rng: SharedRng
}

export interface NextEventParams {
	state: HistoryState
	province: number
	rng: SharedRng
	years?: number
}

export interface ClassifyInitialNeighborRelationParams {
	state: HistoryState
	a: number
	b: number
	rng: SharedRng
}

export interface SeedNeighborRelationsParams {
	state: HistoryState
	rng: SharedRng
}

export interface SeedInitialVassalsParams {
	state: HistoryState
	rng: SharedRng
}

export interface SeedSharedDynastiesParams {
	state: HistoryState
	rng: SharedRng
}

export interface SeedInitialPersonalUnionsParams {
	state: HistoryState
	rng: SharedRng
}

export interface InitDiplomacyParams {
	state: HistoryState
	rng: SharedRng
}

export interface RunDiplomacyParams {
	state: HistoryState
	nation: number
	rng: SharedRng
}

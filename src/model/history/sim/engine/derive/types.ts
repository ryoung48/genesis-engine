import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface DerivedCache {
	gravity?: Map<number, number>
	wealthCurrent?: Map<string, number>
	wealthOptimal?: Map<number, number>
}

export interface DerivedLookupParams {
	state: HistoryState
	p: number
	cache?: DerivedCache
}

export interface DerivedAtTimeParams {
	state: HistoryState
}

export interface WealthCurrentParams extends DerivedLookupParams {
	exclude?: number
	freedom: boolean
}

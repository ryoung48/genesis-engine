import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface EconomyLookupParams {
	state: HistoryState
	p: number
}

export interface TravelDaysParams {
	state: HistoryState
	capital: number
	p: number
}

export interface InitEconomyParams {
	state: HistoryState
}

export interface TerritoryParams extends EconomyLookupParams {
	provinces: number[]
}

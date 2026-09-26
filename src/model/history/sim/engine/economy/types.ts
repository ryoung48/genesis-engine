import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface EconomyLookupParams {
	state: HistoryState
	p: number
}

export interface InitEconomyParams {
	state: HistoryState
}

export type ArmyTradition = "paid" | "tribal" | "steppe"

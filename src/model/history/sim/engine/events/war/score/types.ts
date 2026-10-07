import type { HistoryState, War } from "@/model/history/sim/engine/state/types"

export interface WarScore {
	battles: number
	land: number
	capital: number
	score: number
}

export interface WarScoreParams {
	state: HistoryState
	war: War
}

export interface BattleScoreParams {
	war: War
	winner: number
	loserLossShare: number
}

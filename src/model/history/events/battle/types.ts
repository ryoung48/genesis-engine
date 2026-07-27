import type { HistoryRng } from "@/model/history/history-rng/types"
import type { HistoryState, War } from "@/model/history/state/types"

export type VictoryDegree =
	| "decisive"
	| "victory"
	| "pyrrhic"
	| "close"
	| "defeat"
	| "crushing"

export interface RunBattleParams {
	state: HistoryState
	warIdx: number
	eventAttacker: number
	eventDefender: number
	rng: HistoryRng
}

export interface ExhaustedParams {
	state: HistoryState
	nation: number
}

export interface GetVictoryDegreeParams {
	margin: number
	isWinner: boolean
}

export interface FindInvasionTargetParams {
	state: HistoryState
	war: War
	rng: HistoryRng
}

export interface FindReconquestTargetParams {
	war: War
}

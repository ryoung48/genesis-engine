import type { HistoryState, War } from "@/model/history/generated/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

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
	rng: SharedRng
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
	rng: SharedRng
}

export interface FindReconquestTargetParams {
	war: War
}

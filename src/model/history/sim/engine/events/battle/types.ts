import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type VictoryDegree = "decisive" | "victory" | "pyrrhic"

export interface RunBattleParams {
	state: HistoryState
	warIdx: number
	eventAttacker: number
	eventDefender: number
	rng: SharedRng
}

export interface GetVictoryDegreeParams {
	lossRatio: number
}

export interface FindInvasionTargetParams {
	state: HistoryState
	war: War
	rng: SharedRng
}

export interface FindReconquestTargetParams {
	war: War
}

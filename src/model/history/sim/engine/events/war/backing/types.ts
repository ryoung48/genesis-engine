import type { PeaceOutcome } from "@/model/history/sim/engine/events/peace/types"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface RecruitParams {
	state: HistoryState
	war: War
	rng: SharedRng
}

export interface BackerEnemiesParams {
	state: HistoryState
	war: War
}

export interface RepayParams {
	state: HistoryState
	war: War
	outcome: PeaceOutcome
}

export interface BackerCandidate {
	nation: number
	via: "crown" | "overlord"
	enemyOf: number
}

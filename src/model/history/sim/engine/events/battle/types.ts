import type { BattleOutcome } from "@/model/history/sim/engine/military/types"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface RunBattleParams {
	state: HistoryState
	warIdx: number
	eventAttacker: number
	rng: SharedRng
}

export interface ResolveTargetParams {
	state: HistoryState
	war: War
	attacker: number
	rng: SharedRng
}

export interface BattleTarget {
	attacker: number
	defender: number
	province: number
}

export interface NextBattleTimeParams {
	state: HistoryState
	outcome: BattleOutcome
	rng: SharedRng
}

export interface FindInvasionTargetParams {
	state: HistoryState
	war: War
	rng: SharedRng
}

export interface FindReconquestTargetParams {
	war: War
}

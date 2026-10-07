import type { BattleOutcome } from "@/model/history/sim/engine/military/types"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"
export interface SettleParams {
	state: HistoryState
	war: War
	rng: SharedRng
}

export interface ApplyConquestParams {
	state: HistoryState
	war: War
	attacker: number
	defender: number
	province: number
	attackerWon: boolean
	outcome: BattleOutcome
	loserLossShare: number
	sack: boolean
	record: (loot: number) => void
	rng: SharedRng
}

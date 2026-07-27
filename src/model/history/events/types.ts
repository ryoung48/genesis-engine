import type { HistoryState } from "../state"
import type { HistoryRng } from "../history-rng"

export interface RunBattleParams {
	state: HistoryState
	warIdx: number
	eventAttacker: number
	eventDefender: number
	rng: HistoryRng
}

import type { HistoryRng } from "../history-rng"
import type { HistoryState } from "../state"

export interface RunBattleParams {
	state: HistoryState
	warIdx: number
	eventAttacker: number
	eventDefender: number
	rng: HistoryRng
}

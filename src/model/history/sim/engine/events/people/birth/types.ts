import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface RunBirthParams {
	state: HistoryState
	id: number
	rng: SharedRng
}

export interface QueueBirthsParams {
	state: HistoryState
}

import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface PatricianParams {
	state: HistoryState
	rng: SharedRng
}

export interface RepublicParams {
	state: HistoryState
	realm: number
}

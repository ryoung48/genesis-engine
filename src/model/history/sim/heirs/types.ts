import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SuccessionLaw } from "@/model/history/sim/succession-law/types"
import type { SharedRng } from "@/model/shared/random/rng"

export const UNNAMED = -2
export const NO_HEIR = -1

export interface HeirsOfParams {
	state: HistoryState
	dying: number
	law: SuccessionLaw
	rng: SharedRng
}

export interface HeirResult {
	primary: number
	juniors: number[]
}

import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SuccessionLaw } from "@/model/history/sim/succession-law/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface DivideTitlesParams {
	state: HistoryState
	dying: number
	juniors: readonly number[]
	law: SuccessionLaw
	rng: SharedRng
}

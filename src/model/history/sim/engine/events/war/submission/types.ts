import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface OfferParams {
	state: HistoryState
	attacker: number
	defender: number
	threat: number
	rng: SharedRng
}

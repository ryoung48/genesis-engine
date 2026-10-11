import type { Ruler } from "@/model/history/sim/engine/state/rulers/types"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface StandsParams {
	state: HistoryState
	war: War
}

export interface EnthroneParams {
	state: HistoryState
	war: War
	// The victorious rebel or claimant realm's ruler, read before the peace
	// moved any land.
	ruler: Ruler
	claim: number
	// Whether the ruler's own realm joins the defender in a union.
	union: boolean
	rng: SharedRng
}

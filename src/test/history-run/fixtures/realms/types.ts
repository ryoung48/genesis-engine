import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface RealmsFixtureParams {
	// Neighbours of the hub that join it; 2 gives three realms.
	neighbours: number
}

export interface RealmsFixture {
	state: HistoryState
	// A realm bordering all the others.
	hub: number
	// The hub and its neighbours, the largest first.
	realms: number[]
	rng: SharedRng
}

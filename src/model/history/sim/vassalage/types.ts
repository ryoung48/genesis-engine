import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface GrantInitialParams {
	state: HistoryState
	seed: number
	rng: SharedRng
}

export interface GrantNodeParams extends GrantInitialParams {
	realm: number
	holder: number
	title: number
	children: ReadonlyMap<number, number[]>
}

export interface TitleCandidate {
	title: number
	seat: number
	key: number
}

export interface GrantSubtreeParams {
	state: HistoryState
	title: number
	from: number
	to: number
	children: ReadonlyMap<number, number[]>
}

export interface DistanceParams {
	state: HistoryState
	a: number
	b: number
}

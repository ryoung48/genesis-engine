import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface StatehoodRunParams {
	state: HistoryState
	rng: SharedRng
}

export interface AbsorbParams extends StatehoodRunParams {
	held: number
	wanted: number
}

export interface ProvinceParams {
	state: HistoryState
	p: number
}

export interface DistanceParams {
	state: HistoryState
	a: number
	b: number
}

export interface ClaimOption {
	nation: number
	province: number
	weight: number
}

export interface ClaimOptionsParams {
	state: HistoryState
	frontier: Set<number>
	members: Int32Array
}

export interface StretchParams {
	state: HistoryState
	nation: number
	province: number
	members: number
}

import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface DistrictTitle {
	tier: number
	seat: number
	provinces: number[]
}

export interface DistrictFixtureParams {
	count: number
	titles: DistrictTitle[]
	edges: [number, number][]
	root: number
}

export interface DistrictFixture {
	state: HistoryState
	rng: SharedRng
	root: number
	members: number[]
}

export interface FixtureTitlesParams {
	fixture: DistrictFixture
	titles: DistrictTitle[]
}

export interface FixturePersonParams {
	fixture: DistrictFixture
	seat: number
	father: number
}

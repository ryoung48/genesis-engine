import type { WorldFrame } from "@/model/history/world-frame/types"
import type { Cast, PeopleGeography, Person } from "@/model/people/cast/types"

export interface Seat {
	key: string
	tier: number
	province: number
}

export interface TierParams {
	cast: Cast
	person: Person
	timeMs: number
}

export interface DepthParams extends TierParams {
	depth: number
}

export interface ConjuredSpouse {
	tier: number
	seat: number
	dynasty: number
	dynastyOrigin: number
}

export interface RankDraw {
	lowborn: boolean
	tier: number
}

export interface RankDrawParams {
	cast: Cast
	owner: Person
	startMs: number
}

export interface ConsortParams {
	cast: Cast
	partner: Person
	birthMs: number
}

export interface GeographyParams {
	provinceAdjOffset: Int32Array
	provinceAdjList: Int32Array
	locationProvince: Int32Array
	locationCount: number
}

export interface NeighborParams {
	frame: WorldFrame
	geography: PeopleGeography
	nationId: number
}

export interface SeatsParams {
	frame: WorldFrame
	nationId: number
}

export interface RealmParams {
	cast: Cast
	person: Person
	timeMs: number
}

export interface RingParams {
	cast: Cast
	nationId: number
	timeMs: number
}

export interface FrameIndex {
	provinces: Map<number, number[]>
	titles: Map<number, number[]>
}

export interface ConjureParams {
	cast: Cast
	owner: Person
	tier: number
	startMs: number
}

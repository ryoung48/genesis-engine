import type { WorldFrame } from "@/model/history/world-frame/types"
import type { RulerFact } from "@/model/people/anchors/types"
import type { PersonKey } from "@/model/people/keys/types"
import type { PeopleGeography, PeopleStore } from "@/model/people/store/types"
import type { PersonStub } from "@/model/people/stub/types"

export interface Seat {
	key: string
	tier: number
	province: number
}

export interface TierParams {
	store: PeopleStore
	stub: PersonStub
	timeMs: number
}

export interface DepthParams extends TierParams {
	depth: number
}

export interface SeedParams {
	store: PeopleStore
	nationId: number
	timeMs: number
}

export interface RealmSeedParams {
	store: PeopleStore
	frame: WorldFrame
	nationId: number
	bucket: number
	timeMs: number
	focus: boolean
}

export interface RulerAtParams {
	store: PeopleStore
	nationId: number
	timeMs: number
}

export interface LinkRulerParams {
	store: PeopleStore
	ruler: RulerFact
}

export interface ConsortParams {
	store: PeopleStore
	key: PersonKey
	birthMs: number
}

export type ConjuredSpouse = {
	tier: number
	seat: number
	dynasty: number
	dynastyOrigin: number
}

export interface SpouseParams {
	store: PeopleStore
	owner: PersonStub
	startMs: number
	spouseSex: number
}

export type SpouseChoice =
	| { kind: "claim"; candidate: PersonStub }
	| {
			kind: "conjure"
			tier: number
			seat: number
			dynasty: number
			dynastyOrigin: number
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

export interface HolderParams {
	store: PeopleStore
	seat: Seat
	bucket: number
	timeMs: number
	dynasty: number
	dynastyOrigin: number
	cadet: boolean
}

export interface KinParams {
	store: PeopleStore
	ruler: PersonStub
	timeMs: number
}

export interface RelatedParams {
	store: PeopleStore
	first: PersonStub
	second: PersonStub
}

export interface CandidateParams {
	store: PeopleStore
	owner: PersonStub
	holder: PersonKey
	startMs: number
	spouseSex: number
}

export interface FrameIndex {
	provinces: Map<number, number[]>
	titles: Map<number, number[]>
}

export interface SeatList {
	seats: Seat[]
	kin: PersonKey[]
	dynasty: number
	dynastyOrigin: number
	focus: boolean
	timeMs: number
}

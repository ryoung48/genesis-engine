import type {
	PeopleState,
	RealmOrigin,
	Sex,
} from "@/model/history/sim/people/types"

export type PredecessorRelation =
	| "child"
	| "sibling"
	| "extended kin"
	| "unrelated"

export interface Anchor {
	path: number[]
	origin: RealmOrigin
	sex: Sex
	birth: number
	survives: number
	death: number | null
	father: Anchor | null
	mother: Anchor | null
	rank: number | null
	person: number
}

export interface StartingHouse {
	seed: number
	path: number[]
	seat: number
	time: number
	accession: number
	holder: Anchor
	predecessor: Anchor | null
	proposal: PredecessorRelation | null
	relation: PredecessorRelation | null
	fallback: string | null
}

export interface HouseParams {
	seed: number
	path: number[]
	seat: number
	origin: RealmOrigin
	time: number
	age: number
	rank: number
	sovereign: boolean
}

export interface BridgeParams {
	path: number[]
	origin: RealmOrigin
	older: Anchor
	younger: Anchor
}

export interface MaterializeParams {
	people: PeopleState
	seed: number
	anchors: Anchor[]
}

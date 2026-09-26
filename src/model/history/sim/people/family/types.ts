import type {
	PeopleState,
	RealmOrigin,
	Sex,
} from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface BearParams {
	people: PeopleState
	mother: number
	father: number
	from: number
	until: number
	origin: RealmOrigin
	rng: SharedRng
}

export interface MarryParams {
	people: PeopleState
	a: number
	b: number
	time: number
}

export interface OutsiderParams {
	people: PeopleState
	partner: number
	time: number
	origin: RealmOrigin
	rng: SharedRng
}

export interface ChildDynastyParams {
	people: PeopleState
	mother: number
	father: number
	origin: RealmOrigin
}

export interface NewPersonParams {
	people: PeopleState
	sex: Sex
	birth: number
	father: number
	mother: number
	dynasty: number
	origin: RealmOrigin
	rng: SharedRng
}

export interface Seeker {
	person: number
	realm: number
	// A sovereign ruler or their child.
	royalBlood: boolean
}

export interface MatchParams {
	people: PeopleState
	seeker: Seeker
	pool: Map<number, Seeker[]>
	matched: Set<number>
	neighborsOf: (realm: number) => readonly number[]
	rng: SharedRng
}

export interface AdultParams {
	people: PeopleState
	person: number
	time: number
}

export interface MatchInParams {
	people: PeopleState
	seeker: Seeker
	pool: Map<number, Seeker[]>
	matched: Set<number>
	realms: number[]
	royalOnly: boolean
}

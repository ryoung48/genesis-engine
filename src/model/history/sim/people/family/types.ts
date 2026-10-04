import type {
	MarriageRealms,
	PeopleState,
	RealmOrigin,
} from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

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
	// The seeker would accept this partner.
	fits: (partner: number) => boolean
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
	fits: (partner: number) => boolean
}

export interface SeekMatchesParams extends MarriageRealms {
	people: PeopleState
	time: number
	// Adults who seek this year; royal minors are drawn here.
	seekers: number[]
	sovereigns: number[]
	// Chance that an eligible royal minor seeks this year.
	minorChance: number
	rng: SharedRng
}

export interface MinorSeekersParams {
	people: PeopleState
	time: number
	sovereigns: number[]
	royal: (realm: number) => boolean
	chance: number
	rng: SharedRng
}

export interface ScopeParams {
	people: PeopleState
	time: number
	rulers: number[]
}

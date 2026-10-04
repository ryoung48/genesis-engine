import type { MatchScore } from "@/model/history/sim/people/family/match-scoring/types"
import type {
	CrossMatch,
	MarriageRealms,
	PeopleRandomSource,
	PeopleState,
	PersonDraws,
	RealmOrigin,
} from "@/model/history/sim/people/types"

export interface MarryParams {
	people: PeopleState
	a: number
	b: number
	time: number
}

export interface OutsiderParams {
	draws: PersonDraws | null
	people: PeopleState
	partner: number
	time: number
	origin: RealmOrigin
	rng: PeopleRandomSource
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
	rng: PeopleRandomSource
	time: number
	market: MarriageRealms
	ancestry: Map<number, Set<number>>
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
	time: number
	market: MarriageRealms
	ancestry: Map<number, Set<number>>
}

export interface SeekMatchesParams extends MarriageRealms {
	people: PeopleState
	time: number
	// Adults who seek this year; royal minors are drawn here.
	seekers: number[]
	sovereigns: number[]
	// Chance that an eligible royal minor seeks this year.
	minorChance: number
	rng: PeopleRandomSource
}

export interface MinorSeekersParams {
	people: PeopleState
	time: number
	sovereigns: number[]
	royal: (realm: number) => boolean
	chance: number
	rng: PeopleRandomSource
}

export interface EvaluatePairParams {
	people: PeopleState
	time: number
	match: CrossMatch
	market: MarriageRealms
	ancestry: Map<number, Set<number>>
}

export interface PairEvaluation {
	first: MatchScore
	second: MatchScore
	acceptable: boolean
	total: number
}

export interface AcceptedPair {
	match: CrossMatch
	outsider: boolean
}

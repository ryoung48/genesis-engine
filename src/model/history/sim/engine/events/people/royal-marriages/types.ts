import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type {
	CrossMatch,
	PeopleState,
	RealmOrigin,
} from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface AllianceMatchParams {
	state: HistoryState
	match: CrossMatch
}

export interface PairKeyParams {
	state: HistoryState
	a: number
	b: number
}

export interface ReviewParams {
	state: HistoryState
}

export interface SeedRoyalMarriagesParams {
	state: HistoryState
	rng: SharedRng
}

export interface BirthParentsParams {
	people: PeopleState
	bride: number
	house: number
}

export interface BirthParents {
	father: number
	mother: number
}

export interface RehomeParams {
	people: PeopleState
	person: number
	parents: BirthParents
	dynasty: number
	origin: RealmOrigin
	rng: SharedRng
}

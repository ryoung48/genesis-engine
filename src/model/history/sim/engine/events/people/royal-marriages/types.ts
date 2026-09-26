import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type {
	CrossWedding,
	PeopleState,
	RealmOrigin,
} from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface WeddingParams {
	state: HistoryState
	wedding: CrossWedding
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

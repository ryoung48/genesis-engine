import type { StartingHouse } from "@/model/history/sim/people/family/starting/anchors/types"
import type { PeopleState, RealmOrigin } from "@/model/history/sim/people/types"

export interface AnchorCouple {
	father: number
	survives: number
}

export interface FamilyParams {
	people: PeopleState
	house: StartingHouse
}

export interface StartingFamilies {
	sovereignsMs: number
	housesMs: number
	betrothalsMs: number
	weddingsAccepted: Record<WeddingKind, number>
	weddingsRejected: Record<WeddingKind, number>
	anchorCount: number
	predecessors: Record<string, number>
	predecessorProposals: Record<string, number>
	fallbacks: Record<string, number>
	cousinCandidates: number
	cousinProposals: number
	cousinPairs: number
	cousinRejections: Record<string, number>
	spouseCandidates: number
	rejectedCandidates: number[]
	founderMarriages: number
	remarriages: number
	freshDistricts: number
	relativeGrants: number
	patricianHeads: number
}

export type WeddingKind = "parent" | "founder" | "descendant" | "remarriage"

export interface MarriageHistoryParams extends FamilyParams {
	person: number
	path: number[]
	founder: boolean
}

export interface AnchorMarriageParams extends FamilyParams {
	survives: number
	mother: number
	father: number
	path: number[]
}

export interface InitialOutsiderParams {
	people: PeopleState
	partner: number
	time: number
	origin: RealmOrigin
	seed: number
	path: number[]
}

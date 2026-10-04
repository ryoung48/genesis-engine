import type { MatchScore } from "@/model/history/sim/people/family/match-scoring/types"
import type { OpinionPerson } from "@/model/history/sim/people/opinion/types"

export type SearchKind = "domestic" | "foreign"
export type SelectionKind = SearchKind | "betrothal" | "outsider"
export type FirstFitKind = "ranking" | "rejection" | "unchanged" | "empty"

export interface SearchObservation {
	kind: "search"
	time: number
	group: SearchKind
	visited: number
	hardEligible: number
	kinship: number
	evaluated: number
	observerOnly: number
	candidateOnly: number
	bothNegative: number
	firstFit: FirstFitKind
	scoringMs: number
}

export interface SelectionObservation {
	kind: "selection"
	time: number
	group: SelectionKind
	first: MatchScore
	second: MatchScore
	a: OpinionPerson
	b: OpinionPerson
	current: [number, number]
	projected: [number, number]
	tiers: number[]
}

export interface FallbackObservation {
	kind: "fallback"
	time: number
	age: number
	attempt: boolean
	accepted: boolean
}

export interface ProjectionObservation {
	kind: "projection"
	time: number
	ms: number
}

export interface AncestryObservation {
	kind: "ancestry"
	time: number
	sets: number
	memberships: number
}

export interface KinshipReleaseObservation {
	kind: "kinship release"
	time: number
}

export type MarriageObservation =
	| SearchObservation
	| SelectionObservation
	| FallbackObservation
	| ProjectionObservation
	| AncestryObservation
	| KinshipReleaseObservation

export interface SearchTotals {
	searches: number
	visited: number
	hardEligible: number
	kinship: number
	evaluated: number
	observerOnly: number
	candidateOnly: number
	bothNegative: number
	several: number
	ranking: number
	rejection: number
	unchanged: number
	scoringMs: number
}

export interface AffinityTotals {
	known: number
	same: number
}

export interface SelectionTotals {
	selected: number
	components: Record<
		| "attraction"
		| "opinion"
		| "age"
		| "standing"
		| "alliance"
		| "desperation"
		| "total",
		number
	>
	opinionComponents: Record<
		| "personality"
		| "culture"
		| "religion"
		| "reputation"
		| "kin"
		| "spouse"
		| "memories"
		| "unclamped"
		| "total",
		number
	>
	currentStanding: number
	projectedStanding: number
	ageGap: number
	culture: AffinityTotals
	heritage: AffinityTotals
	religion: AffinityTotals
	rulersByTier: number[]
}

export interface FallbackTotals {
	opportunities: number
	attempts: number
	accepted: number
}

export interface MarriageTotals {
	searches: Record<SearchKind, SearchTotals>
	selections: Record<SelectionKind, SelectionTotals>
	fallback: Record<"through25" | "26to29" | "30to34" | "35plus", FallbackTotals>
	projectionRefreshes: number
	projectionMs: number
	ancestrySets: number
	ancestryMemberships: number
	kinshipReleases: number
}

export interface ObserveMarriageParams {
	totals: MarriageTotals
	observation: MarriageObservation
}

export interface MergeMarriageParams {
	target: MarriageTotals
	source: MarriageTotals
}

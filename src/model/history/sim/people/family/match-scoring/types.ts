import type {
	OpinionBreakdown,
	OpinionContext,
} from "@/model/history/sim/people/opinion/types"

export interface MarriageCandidateContext {
	currentStanding: number
	projectedStanding: number
	sovereignTiers: number[]
	attractionModifier: number
}

export interface MatchScoreParams {
	observer: number
	target: number
	time: number
	context: OpinionContext
	candidateOf: (person: number) => MarriageCandidateContext
	alliance: boolean
	allied: boolean
}

export interface MatchScore {
	attraction: number
	opinion: number
	age: number
	standing: number
	alliance: number
	desperation: number
	total: number
	breakdown: OpinionBreakdown
}

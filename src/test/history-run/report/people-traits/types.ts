import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { Attribute } from "@/model/history/sim/people/attributes/types"
export interface CharacterSample {
	attributes: Record<Attribute, number>
	governorAttributes: Record<Attribute, number>
	personality: string[]
	grades: string[]
	congenital: string[]
	stress: number
	regency: boolean
	ailing: boolean
	revenue: number
	learningGrowth: number
	warChance: number
	regentIntrigue: number | null
	regentTraits: string[]
}
export interface CharacterTracker {
	samples: CharacterSample[]
}
export interface CharacterReportParams {
	engine: HistoryState
	tracker: CharacterTracker
	from: number
	to: number
}
export interface CharacterSampleParams {
	engine: HistoryState
	tracker: CharacterTracker
}
export interface DistributionParams {
	values: number[]
}
export interface CharacterDistribution {
	mean: number
	deviation: number
	tierShares: Record<string, number>
}
export interface CharacterReport {
	rulerYears: number
	attributes: Record<Attribute, CharacterDistribution>
	personalityShares: Record<string, number>
	gradeShares: Record<string, number>
	congenitalShares: Record<string, number>
	carriedShares: Record<string, number>
	recordedBirths: number
	stressLevelShares: number[]
	weakCrownYears: Record<string, number>
	effects: Record<string, number>
}
export interface ShareParams {
	values: string[][]
	denominator: number
}
export interface TercileParams {
	values: number[]
	value: number
}

export interface ValidateCharacterParams {
	engine: HistoryState
}

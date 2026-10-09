import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { Attribute } from "@/model/history/sim/people/attributes/types"
export interface CharacterSample {
	attributes: Record<Attribute, number>
	governorAttributes: Record<Attribute, number>
	personality: string[]
	grades: string[]
	congenital: string[]
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
	rulers: PopulationAccumulator
	people: PopulationAccumulator
	enrichment: { rulers: GroupAccumulator; others: GroupAccumulator }
	appliedEffects: Record<string, AppliedEffectAccumulator>
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
	start: number
}
export interface CharacterDistribution {
	mean: number
	deviation: number
	tierShares: Record<string, number>
	histogram: number[]
}
export type CharacterGroup = { observations: 0 } | CharacterGroupStatistics
export interface CharacterGroupStatistics {
	observations: number
	attributes: Record<Attribute, CharacterDistribution>
	personalityShares: Record<string, number>
	gradeShares: Record<string, number>
	congenitalShares: Record<string, number>
	carriedShares: Record<string, number>
}
export interface CharacterPopulation {
	all: CharacterGroup
	adults: CharacterGroup
	minors: CharacterGroup
}
export interface CharacterEnrichment {
	rulers: CharacterGroup
	others: CharacterGroup
	attributeDifferences: Record<string, number>
	personalityDifferences: Record<string, number>
	gradeDifferences: Record<string, number>
	congenitalDifferences: Record<string, number>
}
export interface AppliedEffect {
	observations: number
	meanDelta: number
	mean: number
	deviation: number
	lowerCapShare: number
	upperCapShare: number
}
export interface InbreedingReportParams {
	engine: HistoryState
	from: number
	to: number
}
export interface BirthRelatednessBand {
	births: number
	inbred: number
	pureBlooded: number
	inbredShare: number | null
	pureBloodedShare: number | null
}
export interface GeneticBirthGroup {
	births: number
	traits: Record<string, number>
	shares: Record<string, number>
}
export interface CharacterReport {
	rulers: CharacterPopulation
	people: CharacterPopulation
	enrichment: CharacterEnrichment
	appliedEffects: Record<string, AppliedEffect>
	weakCrownYears: Record<string, number>
	effects: Record<string, number>
}
export interface AttributeAccumulator {
	sum: number
	squares: number
	tiers: Record<string, number>
	histogram: number[]
}
export interface GroupAccumulator {
	observations: number
	attributes: Record<Attribute, AttributeAccumulator>
	personality: Record<string, number>
	grades: Record<string, number>
	congenital: Record<string, number>
	carried: Record<string, number>
}
export interface PopulationAccumulator {
	all: GroupAccumulator
	adults: GroupAccumulator
	minors: GroupAccumulator
}
export interface AccumulateParams {
	population: PopulationAccumulator
	group: GroupAccumulator | null
	engine: HistoryState
	person: number
}
export interface AppliedEffectAccumulator {
	observations: number
	delta: number
	sum: number
	squares: number
	lower: number
	upper: number
}
export interface AppliedEffectSampleParams {
	tracker: CharacterTracker
	name: string
	attribute: Attribute
	value: number
	lower: number
	upper: number
	proxy: boolean
}
export interface TercileParams {
	values: number[]
	value: number
}

export interface ValidateCharacterParams {
	engine: HistoryState
}

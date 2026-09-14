import type { GalaxySystem } from "@/model/celestial/galaxy/systems/types"
import type { SpecialCircumstance } from "@/ui/wiki/galaxy-generation-panel/types"

export type SystemFilterOperator = "and" | "or"

export type SystemFilterField =
	| "systemBodyCount"
	| "starSpectralClass"
	| "starLuminosityClass"
	| "starYouth"
	| "starCount"
	| "bodyType"
	| "bodyClassification"
	| "bodyComposition"
	| "bodyZone"
	| "bodyTemperature"
	| "bodyHydrosphere"
	| "bodyAtmosphere"
	| "bodyBiosphere"
	| "bodyHabitability"
	| "bodySpecialCircumstance"

export interface SystemFilterCondition {
	kind: "condition"
	id: string
	field: SystemFilterField
	comparison: "is" | "isNot" | "greaterThan" | "lessThan"
	value: string | number
}

export interface SystemFilterGroup {
	kind: "group"
	id: string
	operator: SystemFilterOperator
	nodes: SystemFilterNode[]
}

export type SystemFilterNode = SystemFilterCondition | SystemFilterGroup

export interface SystemFilterRoot {
	kind: "group"
	id: string
	operator: SystemFilterOperator
	nodes: SystemFilterNode[]
}

export interface SystemFilterBodyPair {
	classification: string
	compositionClass: string | undefined
	zone: string | undefined
	temperatureClass: string | undefined
	hydrosphereClass: string | undefined
	atmosphereClass: string | undefined
	breathable: boolean
	biosphereClass: string | undefined
	habitabilityClass: string | undefined
	specialCircumstances: SpecialCircumstance[]
}

export interface SystemFilterBodyEntry {
	systemIndex: number
	planetClassificationTemperaturePairs: SystemFilterBodyPair[]
	moonClassificationTemperaturePairs: SystemFilterBodyPair[]
}

export interface SystemFilterStar {
	spectralClass: string
	luminosityClass: string
	proto: boolean
	primordial: boolean
}

export interface SystemFilterStarMatchInput {
	star: SystemFilterStar
	condition: SystemFilterCondition
}

export interface SystemFilterStarNodeMatchInput {
	node: SystemFilterNode
	star: SystemFilterStar
}

export interface SystemFilterStarEntry {
	systemIndex: number
	stars: SystemFilterStar[]
}

export interface SystemFilterData {
	systems: GalaxySystem[] | null
	starEntries: SystemFilterStarEntry[]
	bodyEntries: SystemFilterBodyEntry[] | null
}

export interface SystemFilterOptions {
	spectralClasses: string[]
	luminosityClasses: string[]
	classifications: string[]
	zones: readonly string[]
	compositionClasses: readonly string[]
	temperatureClasses: readonly string[]
	hydrosphereClasses: readonly string[]
	atmosphereClasses: readonly string[]
	biosphereClasses: readonly string[]
	habitabilityClasses: readonly string[]
	specialCircumstances: readonly SpecialCircumstance[]
}

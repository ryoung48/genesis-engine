import type { GalaxySystem } from "@/model/celestial/galaxy/systems/types"
import type { SpecialCircumstance } from "@/ui/wiki/galaxy-generation-panel/types"

export type SystemFilterOperator = "and" | "or"

export type SystemFilterField =
	| "systemBodyCount"
	| "starSpectralClass"
	| "starLuminosityClass"
	| "starYouth"
	| "starCount"
	| "planetClassification"
	| "planetZone"
	| "planetTemperature"
	| "planetHydrosphere"
	| "planetAtmosphere"
	| "planetBiosphere"
	| "planetHabitability"
	| "planetSpecialCircumstance"
	| "moonClassification"
	| "moonTemperature"
	| "moonHydrosphere"
	| "moonAtmosphere"
	| "moonBiosphere"
	| "moonHabitability"
	| "moonSpecialCircumstance"

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
	planetClassifications: string[]
	planetZones: readonly string[]
	moonClassifications: string[]
	temperatureClasses: readonly string[]
	hydrosphereClasses: readonly string[]
	atmosphereClasses: readonly string[]
	biosphereClasses: readonly string[]
	habitabilityClasses: readonly string[]
	specialCircumstances: readonly SpecialCircumstance[]
}

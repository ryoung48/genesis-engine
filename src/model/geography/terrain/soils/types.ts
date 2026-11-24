import type { RockKind, YoungKind } from "@/model/geography/terrain/rocks/types"

export type SoilModifier = "none" | "black" | "leached" | "podzol"

export type SoilParentKey =
	| Exclude<RockKind, "sea" | "young">
	| Exclude<YoungKind, "none">

export type SoilGrade = "Barren" | "Poor" | "Middling" | "Good" | "Rich"

export interface SoilClimate {
	wet: number
	mean: number
	warmest: number
	coldest: number
}

export interface SoilClimateTerms {
	black: number
	leach: number
	podzol: number
}

export interface SoilAtParams {
	rock: RockKind
	young: YoungKind
	rising: number
	forested: boolean
	climate: SoilClimate
}

export interface SoilKindParams {
	rock: RockKind
	young: YoungKind
}

export interface Soil {
	parent: number
	fertility: number
	modifier: SoilModifier
}

export interface RegionClimateParams {
	region: number
	numRegions: number
	temperatureMonthly: Float32Array
	temperatureAvg: Float32Array
	rainfallAnnual: Float32Array
	petMonthly: Float32Array
}

export interface SoilFertilityParams {
	rock: Uint8Array
	youngKind: Uint8Array
	rising: Float32Array
	vegetation: Uint8Array
	isLand: Uint8Array
	temperatureMonthly: Float32Array
	temperatureAvg: Float32Array
	rainfallAnnual: Float32Array
	petMonthly: Float32Array
}

export interface SoilFertility {
	fertility: Float32Array
	modifier: Uint8Array
}

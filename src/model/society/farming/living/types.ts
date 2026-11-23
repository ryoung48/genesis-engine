import type { ProvinceMeasures } from "@/model/society/farming/measures/types"

export type PostFarmingMode = "none" | "farm" | "herd"

export interface CapacitiesParams {
	measures: ProvinceMeasures
	suitability: Float64Array
}

export interface Capacities {
	forage: Float32Array
	farm: Float32Array
	herd: Float32Array
}

export interface PostModeParams {
	forage: number
	farm: number
	herd: number
	farmShare: number
	herdShare: number
}

export interface HerdShareParams {
	measures: ProvinceMeasures
	cropFit: Float64Array
}

export interface AdoptionParams {
	farmingYear: number
	forage: number
	capacity: number
	hearthTiming: number
	horizonYear: number
}

export interface ExchangeAdoptionParams {
	farmingYear: number
	oceanYear: number
	forage: number
	capacity: number
	horizonYear: number
}

export interface ModeCodeParams {
	mode: PostFarmingMode
}

export interface CodeParams {
	code: number
}

export interface DensityParams {
	forage: number
	capacity: number
	years: number
}

export interface FarmDensityParams {
	capacity: number
}

export interface CropFitParams {
	measures: ProvinceMeasures
}

export interface RampParams {
	years: number
}

export interface YieldFactorParams {
	techLevel: number
}

export interface PastoralYearParams {
	startYears: number[]
	horizonYear: number
}

export interface MixedHerdAdoptionParams {
	arrivalYear: number
	farmingAdoptionYear: number
	horizonYear: number
}

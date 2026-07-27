import type { UrbanizationInputs } from "@/model/society/types"

export interface RankSizeCitiesParams {
	urbanPop: number
	q: number
}

export interface LerpScaleParams {
	domain: number[]
	range: number[]
	v: number
}

export interface ComputeDevelopmentParams {
	inputs: UrbanizationInputs
	urbanPopulation: Float32Array
}

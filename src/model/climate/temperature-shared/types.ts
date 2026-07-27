import type { SphereMesh } from "@/model/types/mesh"

export type ApplyTemperatureNoiseParams = {
	mesh: SphereMesh
	N: number
	seed: number
	temperature_monthly: Float32Array
	temperature_monthly_nolapse: Float32Array
	computeTaper: (r: number, x: number, y: number, z: number) => number
	includeCell: (r: number) => boolean
	temperature_avg?: Float32Array
	temperature_min?: Float32Array
	temperature_max?: Float32Array
}

export type RecomputeAnnualTemperatureStatsParams = {
	temperature_monthly: Float32Array
	temperature_avg: Float32Array
	temperature_min: Float32Array
	temperature_max: Float32Array
	N: number
}

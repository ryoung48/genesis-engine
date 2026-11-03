import type { ProvinceSampleLocation } from "@/model/geography/terrain/provinces/locations/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export type WeatherParticleSource = "sand" | "dust"

export interface WeatherBaseline {
	particleSource: WeatherParticleSource | null
	location: ProvinceSampleLocation
	temperature: Float32Array
	dtr: Float32Array | null
	dewPoint: Float32Array | null
	rain: Float32Array
	rainSlopes: Float64Array
	windU: Float32Array
	windV: Float32Array
	cloud: Float32Array | null
	isLand: boolean
	aridity: number
	bare: boolean
	valid: boolean
}

export interface BuildWeatherBaselineParams {
	world: Pick<
		SerializedGenesisWorld,
		| "params"
		| "mesh"
		| "climate"
		| "dtr_monthly"
		| "rainfall"
		| "windMonthly"
		| "wind"
		| "oceanDist"
		| "vegetation"
		| "topography"
		| "isLand"
	>
	location: ProvinceSampleLocation
	yearSeconds: number
}

export interface SampleMonthlyWeatherParams {
	values: ArrayLike<number>
	phase: number
}

export interface WeatherRainRateParams {
	baseline: WeatherBaseline
	phase: number
	yearSeconds: number
}

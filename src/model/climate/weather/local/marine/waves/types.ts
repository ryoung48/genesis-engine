import type { LocalWeatherValues } from "@/model/climate/weather/local/types"

export type MarineSeaState =
	| "calm"
	| "smooth"
	| "slight"
	| "moderate"
	| "rough"
	| "veryRough"
	| "high"
	| "veryHigh"
	| "phenomenal"
	| "iceCovered"

export interface MarineWaves {
	heightM: number
	state: MarineSeaState
	fromDeg: number | null
	fetchKm: number
}

export interface MarineWaveField {
	adjOffset: Int32Array
	adjList: Int32Array
	neighborDist: Float32Array
	r_xyz: Float32Array
	openWater: Uint8Array
	radiusKm: number
	gravityMs2: number
}

export interface MarineSeaIce {
	perennial: boolean
	seasonal: boolean
}

export interface MarineFetchParams {
	field: MarineWaveField
	sea: number
	windU: number
	windV: number
}

export interface MarineWaveHeightParams {
	windSpeedMs: number
	fetchKm: number
	gravityMs2: number
}

export interface MarineIceCoveredParams {
	ice: MarineSeaIce
	temperatureNormalC: number
}

export interface MarineWavesParams {
	field: MarineWaveField
	sea: number
	ice: MarineSeaIce
	values: Pick<
		LocalWeatherValues,
		| "windU"
		| "windV"
		| "windSpeedMs"
		| "windDirectionDeg"
		| "temperatureNormalC"
	>
}

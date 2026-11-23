import type { GenesisProvinces } from "@/model/society/types"

export interface FarmingHearth {
	province: number
	startYear: number
	odds: number
	timing: number
	dependence: number
	fired: boolean
}

export interface HearthsParams {
	provinces: GenesisProvinces
	landGraph: GenesisProvinces
	r_xyz: Float32Array
	planetRadiusKm: number
	odds: Float64Array
	timing: Float64Array
	dependence: Float64Array
	traversable: Uint8Array
	suitability: Float64Array
	areaKm2: Float64Array
	continuousArrival: Float64Array
}

export interface HearthSchedule {
	hearths: FarmingHearth[]
	farmableKm2: number
}

export interface StartYearParams {
	odds: number
	settledYear: number
}

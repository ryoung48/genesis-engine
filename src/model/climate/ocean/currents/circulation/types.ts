import type { OceanGrid } from "@/model/climate/ocean/currents/grid/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type MonthlyOceanWind = {
	u: Float32Array
	v: Float32Array
}

export type CirculationInput = {
	grid: OceanGrid
	params: GenesisParams
	wind: MonthlyOceanWind
}

export type OceanCirculation = {
	u: Float32Array
	v: Float32Array
	transportU: Float32Array
	transportV: Float32Array
	spinupYears: number
	cycleError: number
}

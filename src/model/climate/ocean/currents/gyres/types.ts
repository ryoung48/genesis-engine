import type { OceanGrid } from "@/model/climate/ocean/currents/grid/types"

export type GyreInput = {
	grid: OceanGrid
	forceU: Float64Array
	forceV: Float64Array
	omega: number
	radius: number
	drag: number
}

export type OceanGyres = {
	u: Float32Array
	v: Float32Array
	residual: number
}

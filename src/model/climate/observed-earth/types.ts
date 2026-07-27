import type { SphereMesh } from "@/model/mesh/types"

export type SampleMonthlyFloatRasterParams = {
	mesh: SphereMesh
	raster: Int16Array
	rasterW: number
	rasterH: number
	months: number
	scale: number
	nodata: number
}

export interface GenesisObservedDtr {
	real_monthly?: Float32Array // [month * N + r] observed monthly DTR °C for imported Earth worlds
	real_annual?: Float32Array // per-cell observed annual-mean DTR °C
	diff_monthly?: Float32Array // [month * N + r] modeled minus observed DTR °C
	diff_annual?: Float32Array // per-cell annual modeled minus observed DTR °C
}

export interface GenesisObservedHumidity {
	real_monthly?: Float32Array // [month * N + r] observed monthly relative humidity % for imported Earth worlds
	real_annual?: Float32Array // per-cell observed annual-mean relative humidity %
}

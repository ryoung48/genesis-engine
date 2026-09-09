import type { LatLonGrid } from "@/model/climate/weather/wind/grid/types"

export type ShallowWaterInput = {
	latDeg: Float32Array
	lonDeg: Float32Array
	pressure: Float32Array
	elevation_km: Float32Array
	planetRadiusM: number
	coriolisPolar: number
}

export type ShallowWaterState = {
	lonBins: number
	latBins: number
	phi: Float32Array
	u: Float32Array
	v: Float32Array
	steps: number
	dt: number
}

export type IntegrateInput = {
	forcing: LatLonGrid
	planetRadiusM: number
	coriolisPolar: number
}

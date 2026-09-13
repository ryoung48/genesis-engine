import type { LatLonGrid } from "@/model/climate/weather/wind/grid/types"

export type SolveDynamicsInput = {
	forcing: LatLonGrid
	friction: number
	coriolisScale: number
	waveCoupling: number
}

export type DynamicCorrectionInput = {
	latDeg: Float32Array
	lonDeg: Float32Array
	pressure: Float32Array
	friction: number
	coriolisScale: number
	waveCoupling: number
}

export type SurfaceWindInput = {
	latDeg: Float32Array
	lonDeg: Float32Array
	pressure: Float32Array
	coriolisScale: number
}

export type DynamicsWind = {
	u: Float32Array
	v: Float32Array
	coarsePressure: Float32Array
}

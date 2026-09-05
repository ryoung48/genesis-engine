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

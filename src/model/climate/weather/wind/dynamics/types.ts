import { DynamicsGrid } from "@/model/climate/weather/wind/grid/types";

export type SolveDynamicsInput = {
	forcing: DynamicsGrid
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

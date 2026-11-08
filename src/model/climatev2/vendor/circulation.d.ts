import type { StageContext, TemperatureStageResult } from "./core.js"

export interface CirculationBelts {
	itcz: number
	hiN: number
	hiS: number
	loN: number
	loS: number
	midN: number
	midS: number
	extraLowsN: number[]
	extraLowsS: number[]
}

export function tropicsWeight(lat: number, itcz: number, hiN: number, hiS: number): number

export interface CirculationResult {
	u: Float32Array
	v: Float32Array
	slp: Float32Array
	conv: Float32Array
	itczLat: Float32Array
	belts: CirculationBelts[]
}

export function derivedCirculation(): (
	ctx: StageContext,
	temperature: TemperatureStageResult,
) => CirculationResult

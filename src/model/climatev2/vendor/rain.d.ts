import type { CirculationResult } from "./circulation.js"
import type { StageContext, TemperatureStageResult } from "./core.js"

export interface RainResult {
	P: Float32Array
	r: Float32Array
	stability: Float32Array
}

export const EARTH_SECONDS_PER_MONTH: number
export const RHO_AIR: number
export function qSat(T: number): number
export const LATENT: number
export const PT_ALPHA: number
export function turcPike(avail: number, ep: number): number

export function columnWaterRain(): (
	ctx: StageContext,
	winds: CirculationResult,
	temperature: TemperatureStageResult,
) => RainResult

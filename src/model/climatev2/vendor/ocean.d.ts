import type { CirculationResult } from "./circulation.js"
import type { StageContext, TemperatureStageResult } from "./core.js"

export interface OceanMonthly {
	qflux: Float32Array
	u: Float32Array
	v: Float32Array
}

export interface OverturningBand {
	hemisphere: 1 | -1
	fromLat: number
	fullLat: number
	polarLat: number
	transportPW: number
	heatPW: number
}

export interface OceanResult {
	overturning: OverturningBand[]
	thermocline: Float32Array
	u: Float32Array
	v: Float32Array
	qflux: Float32Array
	qAdvection: Float32Array
	qUpwelling: Float32Array
	qOverturning: Float32Array
	upwelledDT: Float32Array
	carried: Float32Array
	coastCold: Float32Array
	freshwater: {
		total: Float32Array
		rivers: Float32Array
		rain: Float32Array
		evaporation: Float32Array
	} | null
	monthly: OceanMonthly | null
}

export function windDrivenOcean(): (
	ctx: StageContext,
	circulation: CirculationResult,
	temperature: TemperatureStageResult,
) => OceanResult

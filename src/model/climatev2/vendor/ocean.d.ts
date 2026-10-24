import type { CirculationResult } from "./circulation.js"
import type { StageContext, TemperatureStageResult } from "./core.js"

export interface OceanMonthly {
	qflux: Float32Array
	u: Float32Array
	v: Float32Array
}

export interface OceanResult {
	u: Float32Array
	v: Float32Array
	qflux: Float32Array
	carried: Float32Array
	monthly: OceanMonthly | null
}

export function windDrivenOcean(): (
	ctx: StageContext,
	circulation: CirculationResult,
	temperature: TemperatureStageResult,
) => OceanResult

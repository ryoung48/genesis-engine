import type { CirculationResult } from "./circulation.js"
import type { StageContext, TemperatureStageResult } from "./core.js"

export interface RainResult {
	P: Float32Array
}

export function columnWaterRain(): (
	ctx: StageContext,
	winds: CirculationResult,
	temperature: TemperatureStageResult,
) => RainResult

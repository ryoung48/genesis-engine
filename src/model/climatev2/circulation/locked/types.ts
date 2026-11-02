import type {
	StageContext,
	TemperatureStageResult,
} from "@/model/climatev2/vendor/core.js"

export interface LockedCirculationParams {
	ctx: StageContext
	temperature: TemperatureStageResult
}

export interface LockedCirculation {
	u: Float32Array
	v: Float32Array
	slp: Float32Array
}

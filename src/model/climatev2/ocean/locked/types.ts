import type { LockedCirculation } from "@/model/climatev2/circulation/locked/types"
import type {
	StageContext,
	TemperatureStageResult,
} from "@/model/climatev2/vendor/core.js"

export interface LockedOceanParams {
	ctx: StageContext
	circulation: LockedCirculation
	temperature: TemperatureStageResult
}

export interface LockedOcean {
	u: Float32Array
	v: Float32Array
	qflux: Float32Array
	monthly: null
}

import type { CirculationResult } from "@/model/climatev2/vendor/circulation.js"
import type { StageContext } from "@/model/climatev2/vendor/core.js"

export interface CloudFields {
	cover: Float32Array
	low: Float32Array
	high: Float32Array
	lowThermalContrast: Float32Array
	highThermalContrast: Float32Array
}

export interface CloudEstimateParams {
	ctx: StageContext
	winds: CirculationResult
	rainfall: Float32Array
	yearScale: number
	humidity: Float32Array
	stability: Float32Array
	temperatureMonthly: Float32Array
}

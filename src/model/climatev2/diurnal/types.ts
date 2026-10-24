import type { BilinearWeights } from "@/model/climatev2/outputs/types"
import type { PlanetClimateResult } from "@/model/climatev2/vendor/climate.js"

export interface DiurnalCellsParams {
	result: PlanetClimateResult
	weights: BilinearWeights
	isLand: Uint8Array
}

export interface DiurnalCells {
	monthly: Float32Array
	annual: Float32Array
}

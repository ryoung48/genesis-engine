import type { WindVectors } from "@/model/climate/weather/wind/types"
import type { SstNoiseParams } from "@/model/climatev2/sst-noise/types"
import type { CirculationResult } from "@/model/climatev2/vendor/circulation.js"
import type { TemperatureStageResult } from "@/model/climatev2/vendor/core.js"
import type { OceanResult } from "@/model/climatev2/vendor/ocean.js"
import type { SphereMesh } from "@/model/mesh/types"

export interface BilinearWeights {
	index: Int32Array
	weight: Float32Array
}

export interface BilinearWeightsParams {
	mesh: SphereMesh
	grid: { w: number; h: number; step: number }
}

export interface SampleCellsParams {
	weights: BilinearWeights
	field: ArrayLike<number>
	fieldSize: number
	months: number
	out: Float32Array
	cells: Uint8Array | null
}

export interface MonthlyCellsParams {
	weights: BilinearWeights
	field: ArrayLike<number>
	fieldSize: number
}

export interface SeaStateParams {
	weights: BilinearWeights
	grid: SstNoiseParams["grid"]
	temperature: Pick<
		TemperatureStageResult,
		"monthlySL" | "seaIce" | "seaIceWithOffset"
	>
	temperatureMonthly: Float32Array
	cells: Uint8Array
	mesh: SphereMesh
	seed: number
	procedural: boolean
}

export interface AnnualMeanParams {
	monthly: Float32Array
	N: number
}

export interface RainBeltCellsParams {
	mesh: SphereMesh
	grid: { w: number; step: number }
	itczLat: Float32Array
}

export interface WindFieldsParams {
	weights: BilinearWeights
	circulation: Pick<CirculationResult, "u" | "v" | "slp">
	fieldSize: number
}

export interface WindFields {
	wind: WindVectors
	windUMonthly: Float32Array
	windVMonthly: Float32Array
}

export interface CurrentFlowsParams {
	weights: BilinearWeights
	ocean: Pick<OceanResult, "u" | "v" | "monthly">
	fieldSize: number
}

export interface CurrentFlows {
	flowU: Float32Array
	flowV: Float32Array
	flowUMonthly: Float32Array
	flowVMonthly: Float32Array
}

export interface SeaSurfaceParams {
	anomalyMonthly: Float32Array
	isLand: Uint8Array
}

export interface SeaSurface {
	sst: Float32Array
	sstMonthly: Float32Array
}

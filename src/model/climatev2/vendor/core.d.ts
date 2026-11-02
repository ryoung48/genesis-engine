import type { LockedDeck } from "../clouds/locked/types"
import type { CirculationResult } from "./circulation.js"
import type { LatLonGrid } from "./grid.js"
import type { ClimateOrbit } from "./insolation.js"
import type { OceanResult } from "./ocean.js"
import type { RainResult } from "./rain.js"
import type { CloudFields } from "../clouds/types"

export interface ClimateSurface {
	landFrac: Float32Array
	meanLandKm: Float32Array
	meanKm: Float32Array
}

export interface StageContext {
	grid: LatLonGrid
	surface: ClimateSurface
	anchorMonths: number[]
	options: Record<string, unknown>
}

export interface LockedSurfaceFields {
	sunLand: Float64Array
	sunSea: Float64Array
	seaIce: Float64Array
	dLand: Float64Array
	dSea: Float64Array
	window: Float64Array
	netLand: Float64Array
	netSea: Float64Array
	oceanQ: Float64Array
}

export interface TemperatureStageResult {
	T: Float32Array
	monthly: Float32Array
	monthlySL: Float32Array
	inversion: Float32Array
	seaIce: Float32Array
	lockedSurf: LockedSurfaceFields | null
	state: unknown
}

export interface TemperatureStageInput {
	ctx: StageContext
	winds: CirculationResult | null
	init: unknown
	qflux: Float32Array | null
	rain: Float32Array | null
	ocean: OceanResult | null
	clouds: CloudFields | null
}

export type TemperatureStage = (input: TemperatureStageInput) => TemperatureStageResult

export interface ClimateStages {
	temperature: TemperatureStage
	circulation: (
		ctx: StageContext,
		temperature: TemperatureStageResult,
	) => CirculationResult
	ocean: (
		ctx: StageContext,
		circulation: CirculationResult,
		temperature: TemperatureStageResult,
	) => OceanResult
	rain: (
		ctx: StageContext,
		winds: CirculationResult,
		temperature: TemperatureStageResult,
	) => RainResult
}

export interface ComputeClimateInput {
	xyz: Float32Array | Float64Array
	elevKm: Float32Array
	axes: "y-up" | "z-up"
	land: Uint8Array
}

export interface ComputeClimateOptions extends ClimateOrbit {
	stages: ClimateStages
	couplingsWithOcean: number
	cloudsFromRain: boolean
	seed: number
	onCell: (r: number, T12: Float64Array, P12: Float64Array) => void
}

export interface ComputeClimateResult {
	grid: LatLonGrid
	surface: ClimateSurface
	months: { T: Float32Array; P: Float32Array }
	stages: {
		temperature: TemperatureStageResult
		circulation: CirculationResult
		ocean: OceanResult
		rain: RainResult
	}
	timing: { stage: string; ms: number }[]
}

export function computeClimate(
	input: ComputeClimateInput,
	options: ComputeClimateOptions,
): ComputeClimateResult

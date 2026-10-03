import type { GenesisClimate } from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"
import type { CellRange } from "@/model/shared/parallel/types"

export interface MeshLatitudeGeometry {
	latDegByRegion: Float64Array
	latBandByRegion: Uint8Array
}

export interface LatBandInterpolationParams {
	range: number[]
	latDeg: number
}

export type ComputeLandFractionParams = {
	mesh: SphereMesh
	isLand: Uint8Array
}

export type ComputeMonthlyDaylightHoursParams = {
	mesh: SphereMesh
	params: GenesisParams
}

export type ApplyDtrToClimateMinMaxParams = {
	climate: GenesisClimate
	dtr_monthly: Float32Array
	N: number
}

export type ComputeTemperatureParams = {
	mesh: SphereMesh
	elevation: Float32Array
	landFraction: number[]
	params: GenesisParams
	// [JUSTIFICATION] Callers without coast distances use the zonal seasonal cycle.
	oceanDist?: Float32Array
	isLand: Uint8Array
	// [JUSTIFICATION] Procedural terrain can derive height from normalized elevation.
	elevation_km?: Float32Array
}

export interface ZonalTemperatureCellsParams extends CellRange {
	xyz: Float32Array
	elevation: Float32Array
	elevationKm: Float32Array | null
	oceanDist: Float32Array | null
	isLand: Uint8Array
	annualByBand: number[]
	monthlyByBand: number[][]
	monthlyRangeByBand: number[][]
	monthlyInsolationByBand: number[][]
	gravityRatio: number
	monthly: Float32Array
	noLapse: Float32Array
	monthlyRange: Float32Array
	insolation: Float32Array
}

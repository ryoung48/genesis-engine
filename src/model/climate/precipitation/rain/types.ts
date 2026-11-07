import type { GenesisClimate } from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface ClimateGeometry {
	latDeg: Float32Array
	lonDeg: Float32Array
	regionBin: Int32Array
}

export type ComputeThermalEquatorParams = {
	mesh: SphereMesh
	temps: Float32Array
	// [JUSTIFICATION] Omitted to use the standard 120 longitude bins.
	numBins?: number
	// [JUSTIFICATION] Omitted to use the wide default smoothing window
	// (rain); the wind trough needs a narrower window to keep monsoon shifts.
	halfWindowBins?: number
}

export type ComputeMonthlyThermalEquatorsParams = {
	mesh: SphereMesh
	climate: GenesisClimate
}

import type { GenesisLandmarks } from "@/model/terrain/landmarks"
import type { SphereMesh } from "@/model/types/mesh"
import type { GenesisClimate } from "@/model/types/climate"
import type { GenesisParams } from "@/model/types/tectonics"

export interface ClimateGeometry {
	latDeg: Float32Array
	lonDeg: Float32Array
	absLatDeg: Float32Array
	sinLat: Float32Array
	cosLat: Float32Array
	lonRad: Float32Array
	regionBin: Int32Array
	edgeEastward: Float32Array
	edgeNorthward: Float32Array
}

export type BuildRainRegionMaskParams = {
	isLand: Uint8Array
	/** Omitted when every land cell should be eligible for rainfall. */
	landmarks?: Pick<GenesisLandmarks, "regionLandmark" | "type">
}

export type ComputeThermalEquatorParams = {
	mesh: SphereMesh
	temps: Float32Array
	/** Omitted to use the standard 120 longitude bins. */
	numBins?: number
}

export type ComputeAdvectionParams = {
	mesh: SphereMesh
	elevation: Float32Array
	distCoast: Float32Array
	/** Omitted when annual thermal-equator steering is unavailable. */
	climate?: GenesisClimate
	/** Accepts a radius directly for callers that only have that value. */
	params?: number | Pick<GenesisParams, "planetRadiusKm">
	isLand: Uint8Array
	/** Omitted when elevation must be derived from the normalized field. */
	elevation_km?: Float32Array
}

export type ComputeRainWeightParams = {
	cellLat: number
	teq: number
	eastMoisture: number
	westMoisture: number
	daysPerYear: number
	bandOffsetDeg: number
}

export type ComputeMonthlyRainParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	eastAdv: Float32Array
	westAdv: Float32Array
	isLand: Uint8Array
	/** Omitted only in callers without generation settings. */
	params?: GenesisParams
	/** Omitted to derive thermal equator fields from monthly temperatures. */
	monthlyTEQ?: Float32Array[]
	/** Omitted when coastal distance does not influence rainfall. */
	distCoast?: Float32Array
	/** Omitted when landmarks do not alter the rain mask. */
	landmarks?: Pick<GenesisLandmarks, "regionLandmark" | "type">
}

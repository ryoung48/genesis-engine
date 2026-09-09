import type { GenesisClimate } from "@/model/climate/types"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

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
	// [JUSTIFICATION] Omitted to use the wide default smoothing window
	// (rain); the wind trough needs a narrower window to keep monsoon shifts.
	halfWindowBins?: number
}

export type ComputeAdvectionParams = {
	mesh: SphereMesh
	elevation: Float32Array
	distCoast: Float32Array
	/** Omitted when annual thermal-equator steering is unavailable. */
	climate?: GenesisClimate
	/** Accepts a radius directly for callers that only have that value. */
	params?: number | Pick<GenesisParams, "planetRadiusKm" | "hoursPerDay">
	isLand: Uint8Array
	/** Omitted when elevation must be derived from the normalized field. */
	elevation_km?: Float32Array
	/**
	 * Omitted to fall back to a size-only basin flood-fill, which cannot
	 * tell a landlocked sea/lake (e.g. the Caspian) from open ocean. When
	 * provided, only cells on an actual `ocean`-classified landmark can seed
	 * moisture — a big landlocked water body is real geography but isn't an
	 * evaporative source feeding the global wind-driven advection here.
	 */
	landmarks?: Pick<GenesisLandmarks, "regionLandmark" | "type">
	/**
	 * Per-cell slope in [0, 1], normalized to this mesh's own 95th-percentile
	 * smoothed slope — the same field shown in the hover panel
	 * (`CLASSIFICATION.computeSlopeScore`). Drives windward orographic lift so
	 * "steep" means the same thing here as it does in the UI. Omitted falls
	 * back to no orographic lift (flat everywhere).
	 */
	slopeScore?: Float32Array
}

export type SeasonalRainCurveParams = {
	cellLat: number
	absLat: number
	coast: "east" | "west"
	/** This month's thermal-equator latitude for the cell's longitude bin. */
	teq: number
	bandOffsetDeg: number
	hoursPerDay: number
}

export type SubsidenceFactorParams = {
	cellLat: number
	subsidenceTeq: number
	hoursPerDay: number
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
	/** Per-month thermal-equator latitude by longitude bin (12 entries). */
	monthlyTEQ: Float32Array[]
	/** Omitted when coastal distance does not influence rainfall. */
	distCoast?: Float32Array
	/** Omitted when landmarks do not alter the rain mask. */
	landmarks?: Pick<GenesisLandmarks, "regionLandmark" | "type">
}

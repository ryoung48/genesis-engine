import type { GenesisClimate, GenesisRainfall } from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"

export type BiomeCode = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type AssignClimateZonesParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	temperatureAvg: Float32Array
	temperatureMin: Float32Array
	temperatureMax: Float32Array
}

export type AssignEarthClimateZonesParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	climate: GenesisClimate
}

export type AssignVegetationParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	climate: GenesisClimate
	rainfall: GenesisRainfall
	rng: () => number
	/** Omitted when Pasta zones are unavailable and the fallback classifier is used. */
	pastaZones?: Uint8Array
	/** Omitted when no growing-degree-day diagnostics were computed. */
	gdd?: Float32Array
	/** Omitted when no growing-aridity diagnostics were computed. */
	gar?: Float32Array
}

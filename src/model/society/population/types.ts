import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface BfsUpdateMinHopsParams {
	start: number
	adjOffset: Int32Array
	adjList: Int32Array
	minHops: Int32Array
}

export interface ComputeMigrationParams {
	provinces: GenesisProvinces
	habitability: Float32Array
	mesh: SphereMesh
	planetRadiusKm?: number
	numRegions?: number
}

export interface PlaceCradlesParams {
	continentProvinces: number[]
	normHab: Float32Array
	adjOffset: Int32Array
	adjList: Int32Array
	totalProvinces: number
	k: number
}

export interface ComputeProvinceHabitabilityParams {
	provinces: GenesisProvinces
	_landmarks: GenesisLandmarks
	climateZones: Uint8Array
	vegetation: Uint8Array
	topography: Uint8Array
	oceanCoastal: Uint8Array
	lakeCoastal: Uint8Array
	riverVisible: Uint8Array
	seed: number
}

export interface ComputePopulationParams {
	provinces: GenesisProvinces
	landmarks: GenesisLandmarks
	climateZones: Uint8Array
	vegetation: Uint8Array
	topography: Uint8Array
	oceanCoastal: Uint8Array
	lakeCoastal: Uint8Array
	riverVisible: Uint8Array
	seed: number
	planetRadiusKm?: number
	numRegions?: number
	eraTargetPopulation?: number
	migrationWave?: Float32Array
	settlementWave?: number
	migrationFalloff?: number
}

export interface ProvincePopulation {
	/** Per-province habitability score */
	habitability: Float32Array
	/** Per-province rural population */
	population: Float32Array
	/** Aggregated global habitability score */
	habitabilityScore: number
	/** Total world population */
	totalPopulation: number
	/**
	 * Per-province normalized migration arrival time (0 = cradle origin,
	 * 1 = latest frontier reached). -1 for desolate/unreachable provinces.
	 */
	migrationWave?: Float32Array
	/** Province indices where prehistoric cradles were seeded */
	cradleProvinces?: Int32Array
	/**
	 * Era settlementWave threshold used during generation. Provinces with
	 * migrationWave > settlementWave are unsettled (pop=0). Stored here so
	 * the renderer can distinguish unsettled from settled-stateless provinces
	 * without re-importing era configs.
	 */
	settlementWave?: number
}

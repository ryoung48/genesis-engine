import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"
import type {
	CradleChoice,
	MigrationDiagnostics,
} from "@/model/society/migration/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface ProvinceAreasKm2Params {
	mesh: SphereMesh
	regionProvince: Int32Array
	provinceCount: number
	planetRadiusKm: number
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
	mesh: SphereMesh
	planetRadiusKm?: number
	eraTargetPopulation?: number
	migrationWave?: Float32Array
	settlementWave?: number
	migrationFalloff?: number
	// [JUSTIFICATION] Only the arrival-driven late medieval start knows how long each province has been settled; it replaces the wave falloff there.
	settlementAgeYears?: Float32Array
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
	// [JUSTIFICATION] Earth imports and eras without migration carry no settlement field.
	/** Calendar year each province is first settled; the sentinel when never */
	arrivalYear?: Int32Array
	// [JUSTIFICATION] Present exactly when arrivalYear is.
	/** Province each province was settled from, -1 for the origin and unreached land */
	predecessor?: Int32Array
	// [JUSTIFICATION] Present exactly when arrivalYear is.
	/** Provinces in arrival order, unreached land excluded */
	settlementOrder?: Int32Array
	// [JUSTIFICATION] Present exactly when arrivalYear is.
	/** Agricultural cradles in selection order */
	cradles?: CradleChoice[]
	// [JUSTIFICATION] Present exactly when arrivalYear is.
	/** Counts and distance quantiles of the arrival field's links */
	migrationDiagnostics?: MigrationDiagnostics
	/**
	 * Era settlementWave threshold used during generation. Provinces with
	 * migrationWave > settlementWave are unsettled (pop=0). Stored here so
	 * the renderer can distinguish unsettled from settled-stateless provinces
	 * without re-importing era configs.
	 */
	settlementWave?: number
}

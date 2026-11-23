import type { FarmingHearth } from "@/model/society/farming/hearths/types"
import type { ProvinceMeasures } from "@/model/society/farming/measures/types"
import type { MigrationOutput } from "@/model/society/migration/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface SpreadParams {
	provinces: GenesisProvinces
	migration: MigrationOutput
	measures: ProvinceMeasures
	r_xyz: Float32Array
	planetRadiusKm: number
	hearths: FarmingHearth[]
	postMode: Uint8Array
	traversable: Uint8Array
	horizonYear: number
	// [JUSTIFICATION] null for the crop front, which crosses seas by migration
	// transit; only the herd front sails livestock voyages.
	voyageYear: ((params: VoyageYearParams) => number) | null
	// [JUSTIFICATION] null for every front but the herd front over land that herds
	// reached by voyage, which spreads at the colonial pace.
	colonial: Uint8Array | null
}

export interface VoyageYearParams {
	distanceKm: number
	source: number
	sourceArrival: number
}

export interface Quantiles {
	samples: number
	p10: number | null
	p50: number | null
	p90: number | null
}

export interface SpreadResult {
	farmingYear: Int32Array
	hearthOf: Int32Array
	farmingFrom: Int32Array
	fired: boolean[]
	landEdgeSpeed: Quantiles
}

export interface SpreadEntry {
	province: number
	hearth: number
	seed: boolean
	key: number
}

export interface LandSpeedParams {
	measures: ProvinceMeasures
	suitability: Float64Array
	provinces: GenesisProvinces
	postMode: Uint8Array
	// [JUSTIFICATION] null where no destination spreads at the colonial pace.
	colonial: Uint8Array | null
	source: number
	destination: number
}

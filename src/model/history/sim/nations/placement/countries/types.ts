import type { DejureTitles, TitleMembers } from "@/model/society/dejure/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface PlaceCountriesParams {
	provinces: GenesisProvinces
	active: Uint8Array
	habitability: Float32Array
	waterAccess: Uint8Array
	provinceContinent: Uint8Array | undefined
	migrationWave: Float32Array | undefined
	r_xyz: Float32Array
	seed: number
	maxSpreadRad: number
	targets: number[]
	policy: PlacementPolicy
}

export interface PlacedCountries {
	assignment: Int32Array
	seeds: number[]
	sizes: number[]
}

export type PlacementPolicy =
	| { kind: "simulation"; titles: DejureTitles; titleMembers: TitleMembers }
	| {
			kind: "distribution"
			componentId: Int32Array
			targetComponents: number[]
			ceiling: number
			residualSizes: (params: ResidualCapacityParams) => number[]
	  }

export interface ResidualCapacityParams {
	capacity: number
}

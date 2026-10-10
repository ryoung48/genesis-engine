import type { GenesisParams } from "@/model/pipelines/types"
import type { ProvincePopulation } from "@/model/society/population/types"
import type {
	GenesisNationHierarchy,
	GenesisProvinces,
} from "@/model/society/types"

export interface RankSizeCitiesParams {
	urbanPop: number
	q: number
}

export interface ComputeDevelopmentParams {
	inputs: UrbanizationInputs
	urbanPopulation: Float32Array
}

export interface RankSizesForNationParams {
	governmentTypeIndex: number
	totalPopulation: number
	provinceCount: number
	urbanFactor: number
}

export interface SortByRankParams {
	provinces: number[]
	root: number
	seatRank: ArrayLike<number>
	habitability: ArrayLike<number>
}

export interface SpreadDevelopmentParams {
	count: number
	cityMin: number
	desolate: Uint8Array
	waterAccess: Uint8Array
	urbanAt: (province: number) => number
	sovereignAt: (province: number) => number
	adjOffset: Int32Array
	adjList: Int32Array
}

export interface NationProfile {
	U: number
	q: number
}

export interface UrbanizationInputs {
	params: Pick<GenesisParams, "era">
	provinces: Pick<
		GenesisProvinces,
		"count" | "desolate" | "adjOffset" | "adjList" | "waterAccess"
	>
	nations: Pick<
		GenesisNationHierarchy,
		"parent" | "sovereign" | "governmentType" | "titles"
	>
	population: Pick<ProvincePopulation, "population" | "habitability">
}

export interface UrbanizationResult {
	/** Per-province urban population. */
	urbanPopulation: Float32Array
	/** Per-province rural population (total minus urban). */
	ruralPopulation: Float32Array
	/** Per-province development in [0, 1]. */
	development: Float32Array
}

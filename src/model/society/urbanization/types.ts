import type { ProvincePopulation } from "@/model/society/population/types"
import type {
	GenesisNationHierarchy,
	GenesisProvinces,
	SocietyEra,
} from "@/model/society/types"

export interface CitySizeQuery {
	nation: number
	realmPopulation: number
}

export interface UrbanKnowledge {
	urbanFactor: (nation: number) => number
	maxCitySize: (query: CitySizeQuery) => number
}

export interface StateDevelopmentParams {
	provinces: Pick<
		GenesisProvinces,
		"count" | "desolate" | "adjOffset" | "adjList" | "waterAccess"
	>
	sovereign: Int32Array
	development: Float32Array
	urbanPopulation: Float32Array
}

export interface TechKnowledgeParams {
	nations: Pick<GenesisNationHierarchy, "sovereign" | "governmentType">
	population: Pick<ProvincePopulation, "population" | "techLevel">
}

export interface CityTargetsParams {
	sizes: number[]
	count: number
	maxCitySizeAt: (index: number) => number
	ruralAt: (index: number) => number
}

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
	neighborsAt: (province: number) => Iterable<number>
}

export interface SpreadEntry {
	province: number
	dev: number
	sourceNation: number
	hops: number
	stamp: number
}

export interface NationProfile {
	U: number
	q: number
}

export interface UrbanizationInputs {
	era: SocietyEra
	provinces: Pick<
		GenesisProvinces,
		"count" | "desolate" | "adjOffset" | "adjList" | "waterAccess"
	>
	nations: Pick<
		GenesisNationHierarchy,
		"parent" | "sovereign" | "governmentType" | "titles"
	>
	population: Pick<ProvincePopulation, "population" | "habitability">
	knowledge: UrbanKnowledge
	foraging: Uint8Array
}

export interface UrbanizationResult {
	/** Per-province urban population. */
	urbanPopulation: Float32Array
	/** Per-province rural population (total minus urban). */
	ruralPopulation: Float32Array
	/** Per-province development in [0, 1]. */
	development: Float32Array
}

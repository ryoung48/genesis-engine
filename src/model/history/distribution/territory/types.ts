import type { DistributionProjection } from "@/model/history/distribution/targets/types"
import type {
	GenesisNationHierarchy,
	GenesisProvinces,
} from "@/model/society/types"

export interface Country {
	id: number
	capital: number
	members: Set<number>
	boundary: Set<number>
	contacts: Map<number, number>
	revision: number
	cacheRevision: number
	articulations: Set<number>
	cooldown: number
}
export interface Territory {
	provinces: GenesisProvinces
	owner: Int32Array
	countries: Map<number, Country>
	nextId: number
	capacities: number[]
	componentId: Int32Array
	connectivityScans: number
	connectivityMs: number
	mutations: number
}
export interface InitializeTerritoryParams {
	provinces: GenesisProvinces
	nations: GenesisNationHierarchy
}
export interface TerritoryParams {
	territory: Territory
}
export interface CountryParams {
	territory: Territory
	country: Country
}
export interface TerritoryCuts {
	roots: number[]
	children: Map<number, number[]>
	sizes: Map<number, number>
}
export interface CutMembersParams {
	cuts: TerritoryCuts
	root: number
}
export interface TransferParams {
	territory: Territory
	attacker: number
	defender: number
	province: number
	ceiling: number
}
export interface EnclosureParams {
	territory: Territory
	attacker: number
	province: number
}
export interface SplitParams {
	territory: Territory
	country: Country
	provinces: number[]
}
export interface PlacementParams {
	provinces: GenesisProvinces
	habitability: Float32Array
	waterAccess: Uint8Array
	provinceContinent: Uint8Array | undefined
	migrationWave: Float32Array | undefined
	r_xyz: Float32Array
	seed: number
}
export interface PlacementResult {
	nations: GenesisNationHierarchy
	projection: DistributionProjection
}
export interface ValidationResult {
	ownership: number
	connectivity: number
	capitals: number
}

export interface ConnectedParams {
	territory: Territory
	members: Set<number>
	root: number
}

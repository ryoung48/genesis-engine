import type { GenesisProvinces } from "@/model/society/types"

export interface Country {
	id: number
	capital: number
	members: Set<number>
	boundary: Set<number>
	contacts: Map<number, number>
	revision: number
	cacheRevision: number
	articulations: Map<number, number>
	cooldown: number
}
export interface Territory {
	provinces: GenesisProvinces
	owner: Int32Array
	positions: Float64Array
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
	r_xyz: Float32Array
}
export interface DistanceParams {
	territory: Territory
	a: number
	b: number
}
export interface TerritoryParams {
	territory: Territory
}
export interface CountryParams {
	territory: Territory
	country: Country
}
export interface StretchParams {
	territory: Territory
	country: Country
	province: number
}
export interface PocketParams {
	territory: Territory
	country: Country
	province: number
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
export interface EmptyNationsParams {
	provinces: GenesisProvinces
}
export interface ProvinceParams {
	territory: Territory
	province: number
}
export interface FoundParams {
	territory: Territory
	province: number
}
export interface ClaimParams {
	territory: Territory
	country: Country
	province: number
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

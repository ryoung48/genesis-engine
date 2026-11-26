import type {
	Rgb,
	SystemGroup,
	SystemId,
} from "@/model/geography/terrain/deposits/systems/types"

export type CommodityId =
	| "iron"
	| "copper"
	| "gold"
	| "silver"
	| "tin"
	| "leadZinc"
	| "salt"
	| "coal"
	| "stone"
	| "marble"
	| "clay"
	| "sand"
	| "alum"
	| "mercury"
	| "saltpeter"
	| "amber"
	| "gems"
	| "oilGas"

export interface CommodityInfo {
	id: CommodityId
	name: string
	group: SystemGroup
	rgb: Rgb
	words: string
	sources: readonly (readonly [SystemId, number])[]
}

export interface CommodityAtParams {
	rows: Uint8Array
	numRegions: number
	region: number
	commodity: number
}

export interface CommoditiesAtParams {
	rows: Uint8Array
	numRegions: number
	region: number
	out: Float32Array
}

export interface GradeShares {
	poor: number
	moderate: number
	rich: number
}

export interface SharesParams {
	rows: Uint8Array
	numRegions: number
	land: Uint8Array
}

export interface DepositShares {
	system: GradeShares[]
	commodity: GradeShares[]
}

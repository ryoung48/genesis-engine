import type { VEGETATION } from "@/model/climate/classification/vegetation"
import type { CLASSIFICATION } from "@/model/geography/terrain/classification"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

export type TopographyLabel =
	(typeof CLASSIFICATION.genesisTopographyLabels)[number]

export type VegetationLabel = (typeof VEGETATION.biomeLabels)[number]

export interface ProvinceTerrainParams {
	topography: Uint8Array | null
	vegetation: Uint8Array | null
	seeds: Int32Array
}

export interface ProvinceTerrain {
	topography: Uint8Array
	vegetation: Uint8Array
}

export interface ProvinceCodesParams {
	codes: Uint8Array | null
	seeds: Int32Array
	neutral: number
	source: string
}

export interface BattlefieldParams {
	state: HistoryState
	p: number
}

export interface Battlefield {
	topography: TopographyLabel
	vegetation: VegetationLabel
	// A land battle target whose generated code was water, read as neutral.
	water: boolean
	defense: number
}

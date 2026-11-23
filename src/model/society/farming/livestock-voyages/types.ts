import type { SeaLink } from "@/model/society/migration/sea-links/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface VoyageKnot {
	km: number
	level: number
}

export interface CrossingYearParams {
	distanceKm: number
	knotYears: number[]
}

export interface OpenOceanYearParams {
	knotYears: number[]
}

export interface RoutesParams {
	provinces: GenesisProvinces
	r_xyz: Float32Array
	planetRadiusKm: number
	traversable: Uint8Array
}

export type VoyageRoutes = SeaLink[][]

import type { SphereMesh } from "@/model/mesh/types"

export interface GroundParams {
	mesh: SphereMesh
	planetRadiusKm: number
	elevationKm: Float32Array
	isLand: Uint8Array
}

export interface GroundFields {
	relief: Float32Array
	rough: Float32Array
}

export interface GroundTermsParams {
	relief: number
	rough: number
	plain: boolean
}

export interface GroundTerms {
	gentle: number
	flat: number
	hills: number
	crust: number
	lowFloor: number
	pan: number
}

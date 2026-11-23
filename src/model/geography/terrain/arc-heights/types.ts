import type { ArcCrust } from "@/model/geography/terrain/arc-crust/types"
import type { MarkFeatureFn } from "@/model/geography/terrain/elevation/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface StampArcHeightsParams {
	mesh: SphereMesh
	planetRadiusKm: number
	seed: number
	crust: ArcCrust
	elev: Float32Array
	maxElevKm: number
	maxDepthKm: number
	markFeature: MarkFeatureFn
}

export interface ArcHeightKmParams {
	ageMyr: number
	kmToContinent: number
	island: number
}

export interface HopsFromParams {
	mesh: SphereMesh
	sources: Uint8Array
	maxHops: number
	through: Uint8Array
}

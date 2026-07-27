import type { SphereMesh } from "@/model/types/mesh"

export type MeshWithOptionalNeighborDist = Pick<SphereMesh, "numRegions"> & {
	neighborDist?: Float32Array
}

export interface MeanEdgeLengthKmParams {
	mesh: MeshWithOptionalNeighborDist
	planetRadiusKm?: number
}

export interface RegionPathLengthKmParams {
	r_xyz: Float32Array
	pathRegions: ArrayLike<number>
	planetRadiusKm?: number
}

export interface RegionDistanceKmParams {
	r_xyz: Float32Array
	fromRegion: number
	toRegion: number
	planetRadiusKm?: number
}

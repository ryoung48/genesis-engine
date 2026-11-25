import type { SphereMesh } from "@/model/mesh/types"

type MeshWithOptionalNeighborDist = Pick<SphereMesh, "numRegions"> & {
	neighborDist?: Float32Array
}

export interface MeanEdgeLengthKmParams {
	mesh: MeshWithOptionalNeighborDist
	planetRadiusKm?: number
}

export interface RegionAreasKm2Params {
	mesh: Pick<SphereMesh, "numRegions" | "regionArea">
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

export interface SecondsPerYearParams {
	/** [JUSTIFICATION] Callers pass the planet's own orbital and rotation settings, which may be unset. */
	daysPerYear?: number
	/** [JUSTIFICATION] Callers pass the planet's own orbital and rotation settings, which may be unset. */
	hoursPerDay?: number
}

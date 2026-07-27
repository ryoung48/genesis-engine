import type { SphereMesh } from "@/model/types/mesh"

export type BuildRegionGraphParams = {
	mesh: SphereMesh
	mask: Uint8Array
}

export type ComputeRainBandWarpFieldParams = {
	mesh: SphereMesh
	seed: number
	amplitudeDeg: number
	/** Omitted to generate a warp value for every mesh region. */
	regions?: ArrayLike<number>
}

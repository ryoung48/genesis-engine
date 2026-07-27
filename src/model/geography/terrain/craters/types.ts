export interface Crater {
	cx: number
	cy: number
	cz: number
	radius: number // angular radius in radians
	depth: number // bowl depth (elevation units)
	rimHeight: number // rim elevation boost
	cosThresh: number // early-out: cos(radius * 2.5)
}

import type { SphereMesh } from "@/model/mesh/types"

export interface ApplyCratersParams {
	mesh: SphereMesh
	elevation: Float32Array
	seed: number
	intensity: number
	planetRadiusKm?: number
}

import type { SphereMesh } from "@/model/mesh/types"

export interface SpreadStep {
	from: number
	to: number
}

export interface SpreadParams {
	mesh: Pick<SphereMesh, "adjOffset" | "adjList" | "r_xyz">
	radiusKm: number
	dist: Float64Array
	maxKm: number
	canEnter: (step: SpreadStep) => boolean
	onReach: (step: SpreadStep) => void
}

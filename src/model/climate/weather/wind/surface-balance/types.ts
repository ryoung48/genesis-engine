import type { SphereMesh } from "@/model/mesh/types"

export type MeshGradientParams = {
	mesh: SphereMesh
	field: Float32Array
}

export type MeshGradient = {
	east: Float32Array
	north: Float32Array
}

export type BalanceParams = {
	friction: number
	coriolis: number
	forceEast: number
	forceNorth: number
}

export type BalancedWind = {
	u: number
	v: number
}

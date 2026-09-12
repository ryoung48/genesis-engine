import type { SphereMesh } from "@/model/mesh/types"

export type HadleyScalesParams = {
	mesh: SphereMesh
	rest: Float32Array
	north: Float32Array
	south: Float32Array
	coriolis: Float32Array
	friction: number
	hemisphere: Int8Array
	gust: Float32Array
}

export type HadleyScales = {
	north: number
	south: number
}

export type ComponentWindsParams = {
	mesh: SphereMesh
	pressure: Float32Array
	coriolis: Float32Array
	friction: number
}

export type ComponentWinds = {
	u: Float32Array
	v: Float32Array
}

export type TorqueComponents = {
	rest: ComponentWinds
	north: ComponentWinds
	south: ComponentWinds
	weight: Float32Array
	hemisphere: Int8Array
	gust: Float32Array
}

export type HemisphereTorqueParams = TorqueComponents & {
	scales: HadleyScales
	side: 1 | -1
}

export type BalanceSideParams = TorqueComponents & {
	scales: HadleyScales
	side: 1 | -1
}

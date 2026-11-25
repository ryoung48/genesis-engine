import type { KarstLayers } from "@/model/geography/terrain/karst/types"
import type { SphereMesh } from "@/model/mesh/types"

export type CaveType =
	| "solution"
	| "sinkhole"
	| "grotto"
	| "lava"
	| "sea"
	| "talus"
	| "glacier"

export interface GenesisCaveSites {
	region: Int32Array
	type: Uint8Array
	xyz: Float32Array
	lengthM: Float32Array
}

export interface CavePotentialsParams {
	isLand: Uint8Array
	karst: Pick<KarstLayers, "kind" | "potential" | "water">
	spring: Uint8Array
	rock: Uint8Array
	volcano: Float32Array
	shoreLabel: Uint8Array
	exposureOpenM: Float32Array
	topography: Uint8Array
	slopeScore: Float32Array
	iceThickness: Float32Array
	warmest: Float32Array
}

export interface CaveSitesParams {
	mesh: SphereMesh
	seed: number
	isLand: Uint8Array
	openWater: Uint8Array
	potentials: Float32Array[]
	long: Uint8Array
}

export interface PassageLengthParams {
	type: number
	long: boolean
	draw: number
}

export interface SitePositionParams {
	mesh: SphereMesh
	region: number
	neighbor: number
	fraction: number
	out: number[]
}

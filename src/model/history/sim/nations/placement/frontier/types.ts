import type { SimplexNoise } from "@/model/shared/math/simplex-noise"

export interface NationPlacementScoreParams {
	province: number
	habitability: Float32Array<ArrayBufferLike>
	waterAccess: Uint8Array<ArrayBufferLike>
	provinceContinent: Uint8Array<ArrayBufferLike> | undefined
	target: number
}

export interface ContinentPlacementBonusParams {
	province: number
	provinceContinent: Uint8Array<ArrayBufferLike> | undefined
	target: number
}

export interface MigrationWavePlacementMultiplierParams {
	province: number
	target: number
	migrationWave: Float32Array | undefined
}

export interface TargetSizeBiasParams {
	target: number
}

export interface BestClaimParams {
	nation: number
	seedProvince: number
	frontier: Set<number>
	active: Uint8Array
	assignment: Int32Array
	habitability: Float32Array
	waterAccess: Uint8Array
	r_xyz: Float32Array
	provinceSeeds: Int32Array
	adjOffset: Int32Array
	adjList: Int32Array
	noise: SimplexNoise
	maxSpreadRad: number
	sharedBorderWeight: number
}

export interface ClaimProvinceDynamicParams {
	nation: number
	province: number
	active: Uint8Array
	assignment: Int32Array
	sizes: number[]
	frontier: Set<number>
	adjOffset: Int32Array
	adjList: Int32Array
}

export interface SelectSeedParams {
	target: number
	active: Uint8Array
	assignment: Int32Array
	blocked: Uint8Array
	habitability: Float32Array
	waterAccess: Uint8Array
	migrationWave: Float32Array | undefined
	provinceContinent: Uint8Array | undefined
	componentId: Int32Array
	componentSizes: number[]
	adjOffset: Int32Array
	adjList: Int32Array
}

export interface ProvinceSeedDistanceParams {
	aProvince: number
	bProvince: number
	provinceSeeds: Int32Array
	r_xyz: Float32Array
}

export interface BuildOpenComponentsParams {
	active: Uint8Array
	assignment: Int32Array
	adjOffset: Int32Array
	adjList: Int32Array
}

export interface MarkBlockedParams {
	start: number
	hops: number
	active: Uint8Array
	blocked: Uint8Array
	adjOffset: Int32Array
	adjList: Int32Array
}

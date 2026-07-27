import type { SimplexNoise } from "@/model/shared/math/simplex-noise"

export interface IntegerMassParams {
	total: number
	weights: number[]
}

export interface BuildNationPlanParams {
	total: number
	nationPercentages?: number[]
	nationBuckets?: [number, number][]
}

export interface SpreadBucketSizesParams {
	budget: number
	minSize: number
	maxSize: number
	count: number
}

export interface ContinentPlacementBonusParams {
	province: number
	provinceContinent: Uint8Array<ArrayBufferLike> | undefined
	target: number
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

export interface GroupByNationParams {
	assignment: Int32Array
	nationCount: number
	provinceCount: number
}

export interface ColorDistanceParams {
	a: [number, number, number]
	b: [number, number, number]
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
	provinceContinent: Uint8Array | undefined
	componentId: Int32Array
	componentSizes: number[]
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

export interface RefineGovernmentSubtypeParams {
	mainType: number
	size: number
	wave: number
	hab: number
	water: number
	sizeWeight: number
	r: number
}

export interface NationPlacementScoreParams {
	province: number
	habitability: Float32Array<ArrayBufferLike>
	waterAccess: Uint8Array<ArrayBufferLike>
	provinceContinent: Uint8Array<ArrayBufferLike> | undefined
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
}

export interface AssignGovernmentTypeParams {
	nationIndex: number
	capitalProvince: number
	nationSize: number
	eraMix: GovernmentMix
	sizeWeight: number
	habitability: Float32Array
	waterAccess: Uint8Array
	migrationWave: Float32Array | undefined
	statehoodFraction: number
	seed: number
}

export interface GovernmentMix {
	tribal: number
	monarchy: number
	republic: number
	theocracy: number
	/**
	 * Target fraction of total province mass to convert to colonial government
	 * via the post-pass. Drawn from tribal nations on different landmasses.
	 * Does not need to be included in the tribal/monarchy/republic/theocracy sum.
	 */
	colonial?: number
}

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

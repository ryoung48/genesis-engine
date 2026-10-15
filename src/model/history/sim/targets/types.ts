export interface TargetProfileParams {
	year: number
	habitableProvinces: number
}

export interface TargetProfile {
	stateHeld: number
	sizeShares: number[]
	ceiling: number
}

export interface SizeBucketParams {
	size: number
}

export interface InterpolateParams {
	years: number[]
	values: number[]
	year: number
}

export interface InterpolateRowsParams {
	years: number[]
	rows: number[][]
	year: number
}

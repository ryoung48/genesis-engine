export interface Distribution {
	p50: number
	p90: number
}

export interface PercentileParams {
	values: number[]
	fraction: number
}

export interface SpearmanParams {
	a: number[]
	b: number[]
}

export interface WeightedPercentileParams {
	values: number[]
	weights: number[]
	fraction: number
}

export interface Distribution {
	p50: number
	p90: number
}

export interface PercentileParams {
	values: number[]
	fraction: number
}

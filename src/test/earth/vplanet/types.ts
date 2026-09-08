export interface VplanetReference {
	revision: string
	latitudeDegrees: number[]
	forcingDay: number[]
	insolation: number[][]
	temperature: number[][]
	iceMassBalance: number[][]
}

export interface ComparisonParams {
	actual: number[][]
	expected: number[][]
	weights: number[]
}

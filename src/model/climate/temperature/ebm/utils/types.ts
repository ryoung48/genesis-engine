export interface SolveTridiagonalParams {
	lower: readonly number[]
	diag: readonly number[]
	upper: readonly number[]
	rhs: readonly number[]
}

export interface Matrix2x2 {
	a: number
	b: number
	c: number
	d: number
}

export interface SolveBlockTridiagonal2x2Params {
	lowerLand: readonly number[]
	lowerWater: readonly number[]
	diag: readonly Matrix2x2[]
	upperLand: readonly number[]
	upperWater: readonly number[]
	rhsLand: readonly number[]
	rhsWater: readonly number[]
}

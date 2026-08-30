export interface SolveTridiagonalParams {
	lower: readonly number[]
	diag: readonly number[]
	upper: readonly number[]
	rhs: readonly number[]
}

/** A 2x2 matrix [[a, b], [c, d]] -- used for the land/water-coupled diagonal
 * block in solveBlockTridiagonal2x2. */
export interface Matrix2x2 {
	a: number
	b: number
	c: number
	d: number
}

/**
 * Block-tridiagonal system with one land/water unknown pair per latitude.
 * Cross-latitude coupling (lower/upper) only ever connects land-to-land and
 * water-to-water -- never land-to-water at a different latitude -- so those
 * blocks are diagonal 2x2 matrices, represented here as separate per-field
 * scalar arrays rather than full Matrix2x2s. The land/water coupling itself
 * (Nu*(T_land - T_water)) lives entirely in the full 2x2 `diag` block.
 */
export interface SolveBlockTridiagonal2x2Params {
	lowerLand: readonly number[]
	lowerWater: readonly number[]
	diag: readonly Matrix2x2[]
	upperLand: readonly number[]
	upperWater: readonly number[]
	rhsLand: readonly number[]
	rhsWater: readonly number[]
}

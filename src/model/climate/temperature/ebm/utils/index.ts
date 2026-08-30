import type {
	Matrix2x2,
	SolveBlockTridiagonal2x2Params,
	SolveTridiagonalParams,
} from "@/model/climate/temperature/ebm/utils/types"

const radiansToDegrees = (rad: number) => rad * (180 / Math.PI)

const kelvinToCelsius = (kelvin: number) => kelvin - 273.15

const celsiusToKelvin = (celsius: number) => celsius + 273.15

function meanOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let sum = 0
	for (const value of values) sum += value
	return sum / values.length
}

function minOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let result = values[0]
	for (let i = 1; i < values.length; i++) {
		if (values[i] < result) result = values[i]
	}
	return result
}

function maxOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let result = values[0]
	for (let i = 1; i < values.length; i++) {
		if (values[i] > result) result = values[i]
	}
	return result
}

function solveTridiagonal(params: SolveTridiagonalParams): number[] {
	const { lower, diag, upper, rhs } = params
	const n = diag.length
	const c = new Array(n)
	const d = new Array(n)
	c[0] = upper[0] / diag[0]
	d[0] = rhs[0] / diag[0]
	for (let i = 1; i < n; i++) {
		const m = diag[i] - lower[i] * c[i - 1]
		c[i] = upper[i] / m
		d[i] = (rhs[i] - lower[i] * d[i - 1]) / m
	}
	const x = new Array(n)
	x[n - 1] = d[n - 1]
	for (let i = n - 2; i >= 0; i--) {
		x[i] = d[i] - c[i] * x[i + 1]
	}
	return x
}

function invert2x2(m: Matrix2x2): Matrix2x2 {
	const det = m.a * m.d - m.b * m.c
	return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det }
}

// Left-multiplying by diag(sa, sb) scales rows; right-multiplying scales
// columns -- both collapse to plain arithmetic since the lower/upper blocks
// here are always diagonal (cross-latitude diffusion never mixes land and
// water), so a full 2x2 matrix multiply is never actually needed.
function scaleRows(m: Matrix2x2, sa: number, sb: number): Matrix2x2 {
	return { a: sa * m.a, b: sa * m.b, c: sb * m.c, d: sb * m.d }
}

function scaleCols(m: Matrix2x2, sa: number, sb: number): Matrix2x2 {
	return { a: sa * m.a, b: sb * m.b, c: sa * m.c, d: sb * m.d }
}

function subtract2x2(a: Matrix2x2, b: Matrix2x2): Matrix2x2 {
	return { a: a.a - b.a, b: a.b - b.b, c: a.c - b.c, d: a.d - b.d }
}

function applyMatrix(
	m: Matrix2x2,
	v: readonly [number, number],
): [number, number] {
	return [m.a * v[0] + m.b * v[1], m.c * v[0] + m.d * v[1]]
}

/**
 * Block-Thomas solve for the land/water-coupled column system -- same
 * forward-elimination/back-substitution shape as solveTridiagonal, but each
 * "row" is a 2x2 block (see SolveBlockTridiagonal2x2Params doc for why the
 * off-diagonal blocks stay diagonal while only the main diagonal needs a full
 * 2x2 matrix).
 */
function solveBlockTridiagonal2x2(params: SolveBlockTridiagonal2x2Params): {
	land: number[]
	water: number[]
} {
	const {
		lowerLand,
		lowerWater,
		diag,
		upperLand,
		upperWater,
		rhsLand,
		rhsWater,
	} = params
	const n = diag.length
	const cPrime: Matrix2x2[] = new Array(n)
	const dPrime: Array<[number, number]> = new Array(n)

	const d0Inv = invert2x2(diag[0])
	cPrime[0] = scaleCols(d0Inv, upperLand[0], upperWater[0])
	dPrime[0] = applyMatrix(d0Inv, [rhsLand[0], rhsWater[0]])

	for (let i = 1; i < n; i++) {
		const m = subtract2x2(
			diag[i],
			scaleRows(cPrime[i - 1], lowerLand[i], lowerWater[i]),
		)
		const mInv = invert2x2(m)
		if (i < n - 1) {
			cPrime[i] = scaleCols(mInv, upperLand[i], upperWater[i])
		}
		const prevD = dPrime[i - 1]
		const adjustedRhs: [number, number] = [
			rhsLand[i] - lowerLand[i] * prevD[0],
			rhsWater[i] - lowerWater[i] * prevD[1],
		]
		dPrime[i] = applyMatrix(mInv, adjustedRhs)
	}

	const land = new Array(n)
	const water = new Array(n)
	let next = dPrime[n - 1]
	land[n - 1] = next[0]
	water[n - 1] = next[1]
	for (let i = n - 2; i >= 0; i--) {
		const correction = applyMatrix(cPrime[i], next)
		next = [dPrime[i][0] - correction[0], dPrime[i][1] - correction[1]]
		land[i] = next[0]
		water[i] = next[1]
	}

	return { land, water }
}

export const UTILS = {
	radiansToDegrees,
	kelvinToCelsius,
	celsiusToKelvin,
	meanOf,
	minOf,
	maxOf,
	solveTridiagonal,
	solveBlockTridiagonal2x2,
}

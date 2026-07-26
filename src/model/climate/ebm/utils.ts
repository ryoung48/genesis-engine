import type { SolveTridiagonalParams } from "./types"

export const radiansToDegrees = (rad: number) => rad * (180 / Math.PI)
export const kelvinToCelsius = (kelvin: number) => kelvin - 273.15
export const celsiusToKelvin = (celsius: number) => celsius + 273.15

export function meanOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let sum = 0
	for (const value of values) sum += value
	return sum / values.length
}

export function minOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let result = values[0]
	for (let i = 1; i < values.length; i++) {
		if (values[i] < result) result = values[i]
	}
	return result
}

export function maxOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let result = values[0]
	for (let i = 1; i < values.length; i++) {
		if (values[i] > result) result = values[i]
	}
	return result
}

/**
 * Thomas algorithm for a tridiagonal system: lower[i]*x[i-1] + diag[i]*x[i] +
 * upper[i]*x[i+1] = rhs[i] (lower[0] and upper[n-1] are ignored). O(n), does
 * not mutate its inputs.
 */
export function solveTridiagonal(params: SolveTridiagonalParams): number[] {
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

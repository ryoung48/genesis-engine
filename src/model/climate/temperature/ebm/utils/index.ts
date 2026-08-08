import type { SolveTridiagonalParams } from "@/model/climate/temperature/ebm/utils/types"

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

export const UTILS = {
	radiansToDegrees,
	kelvinToCelsius,
	celsiusToKelvin,
	meanOf,
	minOf,
	maxOf,
	solveTridiagonal,
}

import type { SverdrupPlanet } from "@/model/climate/ocean/currents/sverdrup/circulation/types"

// The 5-point operator over wet cells only. Land never becomes an unknown, so
// psi = 0 on every coast falls out of the numbering rather than being imposed,
// and no basin, wall or channel has to be identified first.
export type StommelOperator = {
	count: number
	cellOf: Int32Array
	diagonal: Float64Array
	east: Float64Array
	west: Float64Array
	north: Float64Array
	south: Float64Array
	neighborEast: Int32Array
	neighborWest: Int32Array
	neighborNorth: Int32Array
	neighborSouth: Int32Array
}

export type BuildOperatorParams = {
	ocean: Uint8Array
	planet: SverdrupPlanet
}

export type SolveStommelParams = {
	operator: StommelOperator
	curl: Float32Array
	planet: SverdrupPlanet
	// [JUSTIFICATION] Successive months differ only in the forcing, so each
	// solve starts from the previous month's answer; null on the first.
	guess: Float64Array | null
}

export type StommelSolution = {
	psi: Float32Array
	state: Float64Array
	iterations: number
	residual: number
}

export type ApplyOperatorParams = {
	operator: StommelOperator
	source: Float64Array
	destination: Float64Array
}

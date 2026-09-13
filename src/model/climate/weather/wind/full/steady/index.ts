import { DYNAMICS } from "@/model/climate/weather/wind/dynamics"
import { FULL_WIND } from "@/model/climate/weather/wind/full"
import type { LargeScaleSolver } from "@/model/climate/weather/wind/full/types"
import type { ComputeWindVectorsInput } from "@/model/climate/weather/wind/types"

// Same full atmospheric model as FULL_WIND (Hadley/Ferrel/polar template,
// surface torque balance, boundary flow, katabatic/orographic terrain
// response) but with the large-scale response solved directly (DYNAMICS,
// an exact spectral steady solve) instead of shallow-water's explicit
// time-march to convergence. Faster since there's no iteration, but doesn't
// model terrain in the large-scale step (no form drag/blocking) the way
// shallow water does, so it isn't a drop-in accuracy replacement -- see
// src/test/earth/wind.md's "Steady-solver experiment" for why the earlier
// attempt at this wasn't retained as the production default.
const dynamicsSolver: LargeScaleSolver = ({
	latDeg,
	lonDeg,
	pressure,
	coriolisSign,
	omegaRatio,
}) => {
	return DYNAMICS.surfaceWind({
		latDeg,
		lonDeg,
		pressure,
		coriolisScale: coriolisSign * omegaRatio,
	})
}

function computeWindVectors(input: ComputeWindVectorsInput): {
	windU: Float32Array
	windV: Float32Array
	pressure: Float32Array
	windSpeed: Float32Array
} {
	return FULL_WIND.computeWindVectorsWithLargeScale({
		...input,
		largeScaleSolver: dynamicsSolver,
	})
}

export const STEADY_WIND = {
	computeWindVectors,
}

import type { ComputeWindVectorsInput } from "@/model/climate/weather/wind/types"

export type PressureComponents = {
	hadley: Float32Array
	rest: Float32Array
}

export type CellSegment = {
	k: number
	hemisphere: number
	t: number
}

export type LargeScaleSolverInput = {
	latDeg: Float32Array
	lonDeg: Float32Array
	pressure: Float32Array
	elevation_km: Float32Array
	planetRadiusKm: number
	coriolisSign: number
	omegaRatio: number
	pressureFactor: number
	rawPerMs: number
}

export type LargeScaleWind = {
	u: Float32Array
	v: Float32Array
	coarsePressure: Float32Array
}

export type LargeScaleSolver = (input: LargeScaleSolverInput) => LargeScaleWind

export type CellBoundariesGeneratorInput = {
	teqByLon: Float32Array
	ridgeTeqByLon: Float32Array
	hw: number
	hoursPerDay: number
	planetRadiusKm: number
	/** Zonal-mean surface temperature per 3-degree latitude bin, equator to pole. */
	latBinMean: Float32Array
}

export type CellBoundariesResult = {
	/** Flattened (lonBin, hemisphere, k) table, stride = boundaryCount - 1. */
	offsets: Float32Array
	boundaryCount: number
}

export type CellBoundariesGenerator = (
	input: CellBoundariesGeneratorInput,
) => CellBoundariesResult

export type OuterBoundaryBaseInput = {
	/** Zero-based index into the outer-boundary anchor table (b2 = 0). */
	boundaryIndex: number
	hoursPerDay: number
}

export type CellPressureAtBoundaryInput = {
	k: number
	cellCollapse: number
	/** The two latitudes (degrees) bounding this cell, trough-ward and pole-ward. */
	latPrev: number
	latK: number
	teq: number
	/** boundaryBase's running value at the previous boundary (0 for k=1). */
	previousPressureAt: number
	/** zonalMeanAt(latPrev) - zonalMeanAt(latK): the standard template's
	 * cumulative-from-neighbor reference, prone to telescoping cancellation
	 * when there are many narrow cells (each alternating-sign increment
	 * partly cancels the last). */
	contrastFromPrev: number
	/** zonalMeanAt(teq) - zonalMeanAt(latK): contrast from the trough itself,
	 * which grows toward the pole regardless of how finely the boundaries
	 * are divided, so it doesn't telescope-cancel with many cells. */
	contrastFromTrough: number
}

/** Returns boundaryBase's absolute value AT this boundary (not a
 * per-degree-C coefficient) -- the generator decides whether to accumulate
 * from previousPressureAt (the standard template's approach) or compute
 * directly from contrastFromTrough (see wind/full/physical-cells, built to
 * avoid the standard approach's telescoping cancellation across many cells). */
export type CellPressureAtBoundaryGenerator = (
	input: CellPressureAtBoundaryInput,
) => number

export type ComputeWindVectorsWithLargeScaleInput = ComputeWindVectorsInput & {
	largeScaleSolver: LargeScaleSolver
	// [JUSTIFICATION] Both optional so wind/full/steady (which only swaps the
	// large-scale solver) doesn't need to pass either; each defaults to the
	// standard fixed-template behavior inside computeWindVectorsWithLargeScale.
	cellBoundariesGenerator?: CellBoundariesGenerator
	cellPressureAtBoundaryGenerator?: CellPressureAtBoundaryGenerator
}

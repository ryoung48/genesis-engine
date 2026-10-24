export function coarsenField(core: LatLonGrid, grid: LatLonGrid, ratio: number, src: ArrayLike<number>): Float64Array

export class LatLonGrid {
	// [JUSTIFICATION] radiusM defaults to Earth's, as in grid.js
	constructor(stepDeg: number, radiusM?: number)
	step: number
	radiusM: number
	w: number
	h: number
	size: number
	lat: Float64Array
	lon: Float64Array
	rowArea: Float64Array
	cellAt(latDeg: number, lonDeg: number): number
	// [JUSTIFICATION] offset is optional because the vendored JS defaults it to 0.
	sample(
		field: ArrayLike<number>,
		latDeg: number,
		lonDeg: number,
		offset?: number,
	): number
}

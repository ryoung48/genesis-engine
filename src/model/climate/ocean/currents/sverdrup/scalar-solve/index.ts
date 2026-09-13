import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import type { SolveScalarParams } from "@/model/climate/ocean/currents/sverdrup/scalar-solve/types"

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H

function solve({
	ocean,
	source,
	west,
	east,
	south,
	north,
	diagonal,
	maxSweeps,
	residualTolerance,
	residualCheckInterval,
}: SolveScalarParams): Float32Array {
	let sourceNorm = 0
	for (let idx = 0; idx < CELLS; idx++)
		if (ocean[idx]) sourceNorm += source[idx] * source[idx]
	const target = residualTolerance * Math.max(Math.sqrt(sourceNorm), 1e-300)
	const field = new Float32Array(CELLS)
	for (let sweep = 0; sweep < maxSweeps; sweep++) {
		const reverseRows = (sweep & 1) === 1
		const reverseColumns = (sweep & 2) === 2
		for (let jj = 1; jj < H - 1; jj++) {
			const j = reverseRows ? H - 1 - jj : jj
			const base = j * W
			for (let ii = 0; ii < W; ii++) {
				const i = reverseColumns ? W - 1 - ii : ii
				const idx = base + i
				if (!ocean[idx]) continue
				field[idx] =
					(source[idx] +
						west[idx] * field[base + SVERDRUP_RASTER.wrapColumn(i - 1)] +
						east[idx] * field[base + SVERDRUP_RASTER.wrapColumn(i + 1)] +
						south[idx] * field[idx - W] +
						north[idx] * field[idx + W]) /
					diagonal[idx]
			}
		}
		if ((sweep + 1) % residualCheckInterval !== 0) continue
		let residualSq = 0
		for (let j = 1; j < H - 1; j++) {
			const base = j * W
			for (let i = 0; i < W; i++) {
				const idx = base + i
				if (!ocean[idx]) continue
				const applied =
					diagonal[idx] * field[idx] -
					west[idx] * field[base + SVERDRUP_RASTER.wrapColumn(i - 1)] -
					east[idx] * field[base + SVERDRUP_RASTER.wrapColumn(i + 1)] -
					south[idx] * field[idx - W] -
					north[idx] * field[idx + W]
				residualSq += (source[idx] - applied) ** 2
			}
		}
		if (Math.sqrt(residualSq) < target) break
	}
	return field
}

export const SVERDRUP_SCALAR_SOLVE = {
	solve,
}

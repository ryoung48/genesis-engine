import type {
	BuildCoastlineParams,
	CoastlineGeometry,
} from "@/model/climate/ocean/currents/sverdrup/circulation/coastline/types"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H
const wrapColumn = SVERDRUP_RASTER.wrapColumn

// How many raster cells offshore a coastline normal direction (and the
// upwelling correction that reads it, see circulation/index.ts) still
// applies. Real coastal-upwelling bands are 20-50km wide, inside a single
// ~100km cell, so only the immediate coastal ring (hop 0) gets full weight --
// this is not a band to spread the same transport-driven correction across
// (that would apply one 50km-wide band's worth of upwelling several times
// over, once per hop), it is how far a direction seeded at the coast is still
// worth keeping so the weight can taper to zero instead of stopping sharply.
const MAX_HOPS = 1

// For every ocean cell within MAX_HOPS of land, the unit direction from the
// nearest coast into open water (BFS-propagated, so it's piecewise-constant
// rather than exact away from the seeding cell) and a 1-at-the-coast to
// 0-at-MAX_HOPS falloff weight. Land cells and cells beyond MAX_HOPS get
// zero for both.
function build({ ocean }: BuildCoastlineParams): CoastlineGeometry {
	const normalX = new Float32Array(CELLS)
	const normalY = new Float32Array(CELLS)
	const hop = new Int32Array(CELLS).fill(-1)
	const queue = new Int32Array(CELLS)
	let head = 0
	let tail = 0

	const trySeed = (oceanIdx: number, dx: number, dy: number) => {
		if (!ocean[oceanIdx] || hop[oceanIdx] !== -1) return
		hop[oceanIdx] = 0
		normalX[oceanIdx] = dx
		normalY[oceanIdx] = dy
		queue[tail++] = oceanIdx
	}

	for (let j = 0; j < H; j++) {
		const base = j * W
		for (let i = 0; i < W; i++) {
			const idx = base + i
			if (ocean[idx]) continue
			trySeed(base + wrapColumn(i + 1), 1, 0)
			trySeed(base + wrapColumn(i - 1), -1, 0)
			if (j < H - 1) trySeed(idx + W, 0, 1)
			if (j > 0) trySeed(idx - W, 0, -1)
		}
	}

	while (head < tail) {
		const idx = queue[head++]
		if (hop[idx] >= MAX_HOPS) continue
		const j = Math.floor(idx / W)
		const i = idx - j * W
		const neighbours = [
			j * W + wrapColumn(i + 1),
			j * W + wrapColumn(i - 1),
			j < H - 1 ? idx + W : -1,
			j > 0 ? idx - W : -1,
		]
		for (const nb of neighbours) {
			if (nb < 0 || !ocean[nb] || hop[nb] !== -1) continue
			hop[nb] = hop[idx] + 1
			normalX[nb] = normalX[idx]
			normalY[nb] = normalY[idx]
			queue[tail++] = nb
		}
	}

	const weight = new Float32Array(CELLS)
	for (let idx = 0; idx < CELLS; idx++) {
		if (hop[idx] < 0) continue
		weight[idx] = Math.max(0, 1 - hop[idx] / MAX_HOPS)
	}

	return { normalX, normalY, weight }
}

export const SVERDRUP_COASTLINE = {
	build,
}

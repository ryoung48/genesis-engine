import type {
	BuildGridInput,
	LatLonGrid,
	SampleGridInput,
} from "@/model/climate/weather/wind/grid/types"

// Coarse lat-lon grid the large-scale solvers run on, with the mesh-to-grid
// averaging and grid-to-mesh bilinear sampling both solvers share.
const GRID_DEG = 2

function gridIndex({
	lonBins,
	i,
	j,
}: {
	lonBins: number
	i: number
	j: number
}): number {
	return j * lonBins + (((i % lonBins) + lonBins) % lonBins)
}

function buildGrid({ latDeg, lonDeg, values }: BuildGridInput): LatLonGrid {
	const lonBins = Math.round(360 / GRID_DEG)
	const latBins = Math.round(180 / GRID_DEG)
	const sum = new Float64Array(lonBins * latBins)
	const count = new Int32Array(lonBins * latBins)
	for (let r = 0; r < values.length; r++) {
		const i = Math.floor((lonDeg[r] + 180) / GRID_DEG)
		const j = Math.max(
			0,
			Math.min(latBins - 1, Math.floor((latDeg[r] + 90) / GRID_DEG)),
		)
		const idx = gridIndex({ lonBins, i, j })
		sum[idx] += values[r]
		count[idx]++
	}
	const out = new Float32Array(lonBins * latBins)
	const filled = new Uint8Array(lonBins * latBins)
	for (let idx = 0; idx < out.length; idx++) {
		if (count[idx] > 0) {
			out[idx] = sum[idx] / count[idx]
			filled[idx] = 1
		}
	}
	for (let pass = 0; pass < 8; pass++) {
		let missing = 0
		for (let j = 0; j < latBins; j++) {
			for (let i = 0; i < lonBins; i++) {
				const idx = j * lonBins + i
				if (filled[idx]) continue
				let s = 0
				let n = 0
				const neighbors = [
					gridIndex({ lonBins, i: i - 1, j }),
					gridIndex({ lonBins, i: i + 1, j }),
					j > 0 ? idx - lonBins : -1,
					j < latBins - 1 ? idx + lonBins : -1,
				]
				for (const nb of neighbors) {
					if (nb >= 0 && filled[nb]) {
						s += out[nb]
						n++
					}
				}
				if (n > 0) {
					out[idx] = s / n
					filled[idx] = 2
				} else missing++
			}
		}
		for (let idx = 0; idx < out.length; idx++) {
			if (filled[idx] === 2) filled[idx] = 1
		}
		if (missing === 0) break
	}
	return { lonBins, latBins, values: out }
}

function sampleGrid({ grid, latDeg, lonDeg }: SampleGridInput): Float32Array {
	const { lonBins, latBins, values } = grid
	const out = new Float32Array(latDeg.length)
	for (let r = 0; r < latDeg.length; r++) {
		const x = (lonDeg[r] + 180) / GRID_DEG - 0.5
		const y = Math.max(
			0,
			Math.min(latBins - 1, (latDeg[r] + 90) / GRID_DEG - 0.5),
		)
		const i0 = Math.floor(x)
		const j0 = Math.floor(y)
		const j1 = Math.min(latBins - 1, j0 + 1)
		const tx = x - i0
		const ty = y - j0
		const p00 = values[gridIndex({ lonBins, i: i0, j: j0 })]
		const p10 = values[gridIndex({ lonBins, i: i0 + 1, j: j0 })]
		const p01 = values[gridIndex({ lonBins, i: i0, j: j1 })]
		const p11 = values[gridIndex({ lonBins, i: i0 + 1, j: j1 })]
		out[r] =
			(p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty
	}
	return out
}

export const GRID = {
	deg: GRID_DEG,
	index: gridIndex,
	build: buildGrid,
	sample: sampleGrid,
}

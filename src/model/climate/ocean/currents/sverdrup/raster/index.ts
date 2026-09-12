import type {
	AverageToRasterParams,
	BuildRasterIndexParams,
	FillRasterGapsParams,
	RasterIndex,
	SampleRasterParams,
	SmoothRasterParams,
} from "@/model/climate/ocean/currents/sverdrup/raster/types"

const WIDTH = 360
const HEIGHT = 181
const MAX_FILL_PASSES = 64
const DEG2RAD = Math.PI / 180
const MIN_COS_LAT = Math.cos(85 * DEG2RAD)

const ROW_COS = Float64Array.from({ length: HEIGHT }, (_, j) =>
	Math.max(MIN_COS_LAT, Math.cos((j - 90) * DEG2RAD)),
)

const wrapColumn = (column: number) => ((column % WIDTH) + WIDTH) % WIDTH

// Empty raster cells (high latitudes, where 1-degree cells are smaller than
// mesh cells) take the mean of their filled 4-neighbours, growing inward
// until everything reachable is filled.
function fillGaps({ values, filled }: FillRasterGapsParams): void {
	const pendingIdx = new Int32Array(WIDTH * HEIGHT)
	const pendingValue = new Float32Array(WIDTH * HEIGHT)
	for (let pass = 0; pass < MAX_FILL_PASSES; pass++) {
		let pending = 0
		for (let j = 0; j < HEIGHT; j++) {
			for (let i = 0; i < WIDTH; i++) {
				const idx = j * WIDTH + i
				if (filled[idx]) continue
				let sum = 0
				let n = 0
				const west = j * WIDTH + wrapColumn(i - 1)
				const east = j * WIDTH + wrapColumn(i + 1)
				if (filled[west]) {
					sum += values[west]
					n++
				}
				if (filled[east]) {
					sum += values[east]
					n++
				}
				if (j > 0 && filled[idx - WIDTH]) {
					sum += values[idx - WIDTH]
					n++
				}
				if (j < HEIGHT - 1 && filled[idx + WIDTH]) {
					sum += values[idx + WIDTH]
					n++
				}
				if (n === 0) continue
				pendingIdx[pending] = idx
				pendingValue[pending] = sum / n
				pending++
			}
		}
		if (pending === 0) return
		for (let k = 0; k < pending; k++) {
			values[pendingIdx[k]] = pendingValue[k]
			filled[pendingIdx[k]] = 1
		}
	}
}

function buildIndex({
	latDeg,
	lonDeg,
	isOcean,
}: BuildRasterIndexParams): RasterIndex {
	const N = latDeg.length
	const regionCell = new Int32Array(N)
	const votes = new Float32Array(WIDTH * HEIGHT)
	const filled = new Uint8Array(WIDTH * HEIGHT)
	for (let r = 0; r < N; r++) {
		const row = Math.max(0, Math.min(HEIGHT - 1, Math.round(latDeg[r] + 90)))
		const idx = row * WIDTH + wrapColumn(Math.round(lonDeg[r] + 180))
		regionCell[r] = idx
		votes[idx] += isOcean[r] ? 1 : -1
		filled[idx] = 1
	}
	for (let i = 0; i < votes.length; i++) votes[i] = Math.sign(votes[i])
	fillGaps({ values: votes, filled })
	const ocean = new Uint8Array(WIDTH * HEIGHT)
	for (let i = 0; i < votes.length; i++) ocean[i] = votes[i] > 0 ? 1 : 0
	return { regionCell, ocean }
}

function average({ index, values, include }: AverageToRasterParams) {
	const sum = new Float32Array(WIDTH * HEIGHT)
	const count = new Int32Array(WIDTH * HEIGHT)
	for (let r = 0; r < values.length; r++) {
		if (include && !include[r]) continue
		sum[index.regionCell[r]] += values[r]
		count[index.regionCell[r]]++
	}
	const filled = new Uint8Array(WIDTH * HEIGHT)
	for (let i = 0; i < sum.length; i++) {
		if (count[i] === 0) continue
		sum[i] /= count[i]
		filled[i] = 1
	}
	fillGaps({ values: sum, filled })
	return sum
}

function smooth({ field, mask, passes }: SmoothRasterParams): Float32Array {
	let src = field.slice()
	let dst = new Float32Array(field.length)
	for (let pass = 0; pass < passes; pass++) {
		for (let j = 0; j < HEIGHT; j++) {
			for (let i = 0; i < WIDTH; i++) {
				const idx = j * WIDTH + i
				if (mask && !mask[idx]) {
					dst[idx] = src[idx]
					continue
				}
				let sum = src[idx]
				let n = 1
				const neighbours = [
					j * WIDTH + wrapColumn(i - 1),
					j * WIDTH + wrapColumn(i + 1),
					j > 0 ? idx - WIDTH : -1,
					j < HEIGHT - 1 ? idx + WIDTH : -1,
				]
				for (const nb of neighbours) {
					if (nb < 0 || (mask && !mask[nb])) continue
					sum += src[nb]
					n++
				}
				dst[idx] = sum / n
			}
		}
		;[src, dst] = [dst, src]
	}
	return src
}

// Bilinear sample onto mesh regions, dropping corners outside `mask` so
// ocean values near a coast aren't diluted by land cells.
function sample({
	field,
	mask,
	latDeg,
	lonDeg,
	include,
}: SampleRasterParams): Float32Array {
	const N = latDeg.length
	const out = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (!include[r]) continue
		const x = lonDeg[r] + 180
		const y = Math.max(0, Math.min(HEIGHT - 1, latDeg[r] + 90))
		const x0 = Math.floor(x)
		const y0 = Math.min(HEIGHT - 2, Math.floor(y))
		const fx = x - x0
		const fy = y - y0
		const i0 = wrapColumn(x0)
		const i1 = wrapColumn(x0 + 1)
		const corners = [
			[y0 * WIDTH + i0, (1 - fx) * (1 - fy)],
			[y0 * WIDTH + i1, fx * (1 - fy)],
			[(y0 + 1) * WIDTH + i0, (1 - fx) * fy],
			[(y0 + 1) * WIDTH + i1, fx * fy],
		] as const
		let sum = 0
		let weight = 0
		for (const [idx, w] of corners) {
			if (!mask[idx]) continue
			sum += field[idx] * w
			weight += w
		}
		if (weight > 1e-6) out[r] = sum / weight
	}
	return out
}

export const SVERDRUP_RASTER = {
	width: WIDTH,
	height: HEIGHT,
	rowCos: ROW_COS,
	wrapColumn,
	buildIndex,
	average,
	smooth,
	sample,
}

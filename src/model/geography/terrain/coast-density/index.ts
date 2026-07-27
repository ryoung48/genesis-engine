import type {
	BuildCoastDensityWeightParams,
	ComputeBoundaryDistancePxParams,
	MergeLandLakeMaskParams,
} from "@/model/geography/terrain/coast-density/types"

const BOUNDARY_SEARCH_CAP_PX = 80

const FALLOFF_PX = 16

function computeBoundaryDistancePx({
	mask,
	width,
	height,
	provinceRaster,
}: ComputeBoundaryDistancePxParams): Uint16Array {
	const dist = new Uint16Array(width * height).fill(BOUNDARY_SEARCH_CAP_PX)
	const isLand = (x: number, y: number) => mask[y * width + x] >= 128
	const provinceAt = provinceRaster
		? (x: number, y: number) => provinceRaster[y * width + x]
		: undefined

	const queue = new Int32Array(width * height)
	let qHead = 0
	let qTail = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const land = isLand(x, y)
			const xw = (x + 1) % width
			const xe = (x - 1 + width) % width
			let neighborsDiffer =
				land !== isLand(xw, y) ||
				land !== isLand(xe, y) ||
				(y > 0 && land !== isLand(x, y - 1)) ||
				(y < height - 1 && land !== isLand(x, y + 1))
			// Province borders are also treated as a density-boosting boundary,
			// alongside coastline, so interior political borders get the same
			// resolution boost as coastlines rather than only the coast.
			if (!neighborsDiffer && provinceAt) {
				const p = provinceAt(x, y)
				neighborsDiffer =
					p !== provinceAt(xw, y) ||
					p !== provinceAt(xe, y) ||
					(y > 0 && p !== provinceAt(x, y - 1)) ||
					(y < height - 1 && p !== provinceAt(x, y + 1))
			}
			if (neighborsDiffer) {
				const idx = y * width + x
				dist[idx] = 0
				queue[qTail++] = idx
			}
		}
	}

	while (qHead < qTail) {
		const idx = queue[qHead++]
		const d = dist[idx]
		if (d >= BOUNDARY_SEARCH_CAP_PX) continue
		const x = idx % width
		const y = (idx / width) | 0
		const neighbors = [
			[(x + 1) % width, y],
			[(x - 1 + width) % width, y],
			y > 0 ? [x, y - 1] : null,
			y < height - 1 ? [x, y + 1] : null,
		] as const
		for (const n of neighbors) {
			if (!n) continue
			const nIdx = n[1] * width + n[0]
			if (dist[nIdx] > d + 1) {
				dist[nIdx] = d + 1
				queue[qTail++] = nIdx
			}
		}
	}

	return dist
}

function mergeLandLakeMask({
	mask,
	lakeMask,
}: MergeLandLakeMaskParams): Uint8Array {
	if (!lakeMask) return mask
	const merged = new Uint8Array(mask.length)
	for (let i = 0; i < mask.length; i++) {
		merged[i] = mask[i] >= 128 && lakeMask[i] < 128 ? 255 : 0
	}
	return merged
}

function buildCoastDensityWeight({
	mask,
	width,
	height,
	options,
}: BuildCoastDensityWeightParams): (latDeg: number, lonDeg: number) => number {
	const {
		boost,
		landInteriorWeight = 1,
		oceanInteriorWeight = 0.075 / 32,
		lakeMask,
		provinceRaster,
	} = options
	const combined = mergeLandLakeMask({ mask, lakeMask })
	const distPx = computeBoundaryDistancePx({
		mask: combined,
		width,
		height,
		provinceRaster,
	})

	return (latDeg: number, lonDeg: number) => {
		const px = (((lonDeg + 180) / 360) * width) % width
		const py = Math.max(0, Math.min(height - 1, ((90 - latDeg) / 180) * height))
		const xi = ((Math.round(px) % width) + width) % width
		const yi = Math.min(height - 1, Math.round(py))
		const idx = yi * width + xi
		const d = distPx[idx]
		const isLand = combined[idx] >= 128
		const baseline = isLand ? landInteriorWeight : oceanInteriorWeight
		return baseline + boost * Math.exp(-d / FALLOFF_PX)
	}
}

export const COAST_DENSITY = {
	buildCoastDensityWeight,
}

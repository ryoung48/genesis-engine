/**
 * Derives a lat/lon density-weighting function from a land/ocean coastline
 * mask, for biasing mesh point placement (see mesh.ts's
 * generateAdaptiveFibonacciSphere) toward the coastline without increasing
 * the total point budget.
 */

const BOUNDARY_SEARCH_CAP_PX = 80 // stop BFS once distance exceeds this
const FALLOFF_PX = 16 // e-folding distance of the density boost, in pixels

/**
 * Bounded multi-source BFS distance transform (in pixel units) from every
 * coastline boundary pixel (a mask pixel adjacent to a differently-classified
 * neighbor). Distances beyond BOUNDARY_SEARCH_CAP_PX are left at the cap —
 * we only care about "close to coast" weighting, not exact far-field
 * distance, so capping keeps this O(mask size) instead of unbounded.
 */
function computeBoundaryDistancePx(
	mask: Uint8Array,
	width: number,
	height: number,
	provinceRaster?: Int16Array,
): Uint16Array {
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

interface CoastDensityOptions {
	/** Extra weight added right at the coastline, decaying with distance. */
	boost: number
	/** Baseline weight for open land, away from the coast. */
	landInteriorWeight?: number
	/**
	 * Baseline weight for open ocean, away from the coast. Kept low by
	 * default — deep ocean rarely needs the same resolution as land terrain,
	 * so starving it frees up point budget for the coast and land interior
	 * without changing the total point count.
	 */
	oceanInteriorWeight?: number
	/**
	 * Optional lake mask (255 = lake, 0 = not-lake), same convention and
	 * resolution as `mask`. When provided, lake shorelines are treated as a
	 * coastline for density purposes — a mesh cell right next to a real lake
	 * gets the same boost real ocean coastline gets — and lake interiors get
	 * the sparse ocean-interior baseline rather than the dense land baseline.
	 */
	lakeMask?: Uint8Array
	/**
	 * Optional province-id raster (same resolution as `mask`). Pixels
	 * adjacent to a differently-numbered province are treated as an extra
	 * density-boosting boundary alongside the coastline, so province borders
	 * get dense mesh coverage even deep inland, away from any coast.
	 */
	provinceRaster?: Int16Array
}

// Merges the land/ocean mask with a lake mask into a single land/water
// classification: land minus lake pixels. Lake shorelines then fall out of
// the same boundary-distance computation used for the real coastline, with
// no separate code path needed.
function mergeLandLakeMask(
	mask: Uint8Array,
	lakeMask?: Uint8Array,
): Uint8Array {
	if (!lakeMask) return mask
	const merged = new Uint8Array(mask.length)
	for (let i = 0; i < mask.length; i++) {
		merged[i] = mask[i] >= 128 && lakeMask[i] < 128 ? 255 : 0
	}
	return merged
}

export function buildCoastDensityWeight(
	mask: Uint8Array,
	width: number,
	height: number,
	options: CoastDensityOptions,
): (latDeg: number, lonDeg: number) => number {
	const {
		boost,
		landInteriorWeight = 1,
		oceanInteriorWeight = 0.075 / 32,
		lakeMask,
		provinceRaster,
	} = options
	const combined = mergeLandLakeMask(mask, lakeMask)
	const distPx = computeBoundaryDistancePx(
		combined,
		width,
		height,
		provinceRaster,
	)

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

/**
 * Orogen topography classification: derives terrain categories
 * from physically-simulated elevation, slope, and tectonic data.
 */
import type { SphereMesh, BoundaryInfo, DistanceFields, OrogenRainfall } from "./types"

/** Category codes stored in Uint8Array */
export const TOPO_OCEAN = 0
export const TOPO_MOUNTAINS = 1
export const TOPO_PLATEAU = 2
export const TOPO_HILLS = 3
export const TOPO_FLAT = 4
export const TOPO_COASTAL = 5
export const TOPO_MARSH = 6

export const TOPO_LABELS = ["ocean", "mountains", "plateau", "hills", "flat", "coastal", "marsh"]

/**
 * Classify each mesh cell into a topography category.
 *
 * Pass 1: compute slope and local relief per land cell.
 * Pass 2: priority cascade classification.
 *
 * Slope = max |Δelev| / neighborDist across neighbors.
 * On a unit sphere with ~200K pts, neighborDist ≈ 0.008,
 * so slopes are large (flat terrain ≈ 0.05–0.2, mountains ≈ 2–5+).
 */
export function assignTopography(
	mesh: SphereMesh,
	elevation: Float32Array,
	distFields: DistanceFields,
	boundary: BoundaryInfo,
	oceanDist: Float32Array,
	rainfall: OrogenRainfall,
): Uint8Array {
	const N = mesh.numRegions
	const { adjOffset, adjList, neighborDist } = mesh

	// Pass 1: slope + local relief
	const slope = new Float32Array(N)
	const relief = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		if (elevation[r] <= 0) continue // skip ocean

		let maxSlope = 0
		let minElev = elevation[r]
		let maxElev = elevation[r]

		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			const dist = neighborDist[j]
			if (dist > 0) {
				const s = Math.abs(elevation[r] - elevation[nb]) / dist
				if (s > maxSlope) maxSlope = s
			}
			if (elevation[nb] < minElev) minElev = elevation[nb]
			if (elevation[nb] > maxElev) maxElev = elevation[nb]
		}

		slope[r] = maxSlope
		relief[r] = maxElev - minElev
	}

	// Log percentile stats for tuning
	{
		const landSlopes: number[] = []
		const landRelief: number[] = []
		const landElev: number[] = []
		for (let r = 0; r < N; r++) {
			if (elevation[r] > 0) {
				landSlopes.push(slope[r])
				landRelief.push(relief[r])
				landElev.push(elevation[r])
			}
		}
		landSlopes.sort((a, b) => a - b)
		landRelief.sort((a, b) => a - b)
		landElev.sort((a, b) => a - b)
		const pct = (arr: number[], p: number) => arr[Math.floor(arr.length * p)] ?? 0
		console.log(
			`Topography stats (${landSlopes.length} land cells):\n` +
			`  slope   p25=${pct(landSlopes, 0.25).toFixed(3)} p50=${pct(landSlopes, 0.5).toFixed(3)} p75=${pct(landSlopes, 0.75).toFixed(3)} p90=${pct(landSlopes, 0.9).toFixed(3)} p95=${pct(landSlopes, 0.95).toFixed(3)}\n` +
			`  relief  p25=${pct(landRelief, 0.25).toFixed(4)} p50=${pct(landRelief, 0.5).toFixed(4)} p75=${pct(landRelief, 0.75).toFixed(4)} p90=${pct(landRelief, 0.9).toFixed(4)} p95=${pct(landRelief, 0.95).toFixed(4)}\n` +
			`  elev    p25=${pct(landElev, 0.25).toFixed(4)} p50=${pct(landElev, 0.5).toFixed(4)} p75=${pct(landElev, 0.75).toFixed(4)} p90=${pct(landElev, 0.9).toFixed(4)} p95=${pct(landElev, 0.95).toFixed(4)}`,
		)
	}

	// Pass 2: classify (priority cascade)
	const topo = new Uint8Array(N)
	const counts = new Int32Array(TOPO_LABELS.length)

	for (let r = 0; r < N; r++) {
		const elev = elevation[r]

		// 1. Ocean
		if (elev <= 0) {
			topo[r] = TOPO_OCEAN
			counts[TOPO_OCEAN]++
			continue
		}

		// 2. Coastal: land within ~1.5 hops of ocean
		if (distFields.distCoastLand[r] <= 1.5) {
			// Coastal marsh: wet + low + near ocean
			if (
				rainfall.annual[r] > 1200 &&
				elev < 0.04 &&
				oceanDist[r] < 50
			) {
				topo[r] = TOPO_MARSH
				counts[TOPO_MARSH]++
			} else {
				topo[r] = TOPO_COASTAL
				counts[TOPO_COASTAL]++
			}
			continue
		}

		// 3. Inland marsh: low, wet, not too far from ocean
		if (elev < 0.06 && rainfall.annual[r] > 1500 && oceanDist[r] < 150) {
			topo[r] = TOPO_MARSH
			counts[TOPO_MARSH]++
			continue
		}

		// 4. Mountains: high elevation + steep slope or high relief
		//    Slope on unit sphere ~200K pts: p50≈10, p75≈16, p90≈29
		//    Relief: p50≈0.11, p75≈0.17, p90≈0.31
		//    Elev: p50≈0.34, p75≈0.46, p90≈0.56
		if (
			(elev > 0.40 && (slope[r] > 16 || relief[r] > 0.20)) ||
			(boundary.mountain_r.has(r) && elev > 0.30)
		) {
			topo[r] = TOPO_MOUNTAINS
			counts[TOPO_MOUNTAINS]++
			continue
		}

		// 5. Plateau: high elevation + low relief + gentle slope
		if (elev > 0.35 && relief[r] < 0.08 && slope[r] < 6) {
			topo[r] = TOPO_PLATEAU
			counts[TOPO_PLATEAU]++
			continue
		}

		// 6. Hills: moderate slope or relief
		if (
			slope[r] > 16 ||
			relief[r] > 0.18 ||
			(elev > 0.25 && slope[r] > 12)
		) {
			topo[r] = TOPO_HILLS
			counts[TOPO_HILLS]++
			continue
		}

		// 7. Default: flat
		topo[r] = TOPO_FLAT
		counts[TOPO_FLAT]++
	}

	// Log distribution
	const landCells = N - counts[TOPO_OCEAN]
	if (landCells > 0) {
		console.log(
			"Topography distribution (land cells):\n" +
			TOPO_LABELS
				.map((label, i) => {
					if (i === 0) return null // skip ocean
					const pct = ((counts[i] / landCells) * 100).toFixed(1)
					return `  ${label.padEnd(10)} ${counts[i].toString().padStart(7)} (${pct}%)`
				})
				.filter(Boolean)
				.join("\n"),
		)
	}

	return topo
}

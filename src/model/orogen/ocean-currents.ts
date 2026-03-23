/**
 * Ocean current warmth model.
 *
 * Classifies coastal ocean cells as warm or cold using the existing moisture
 * advection fields (east/west) and TEQ-relative latitude bands. Then BFS-
 * propagates the warmth signal through ocean cells with distance fade, and
 * diffuses the result onto nearby land cells.
 *
 * No tangent frames or explicit wind vectors required — piggybacks on the
 * advection infrastructure that already encodes wind regime per cell.
 */
import type { SphereMesh, OrogenClimate, OrogenParams } from "./types"
import { computeThermalEquator } from "./rain"
import { meanEdgeLengthKm } from "./units"

const RAD2DEG = 180 / Math.PI

export interface OceanCurrentResult {
	/** Per-cell ocean warmth: -1 (cold) to +1 (warm). Zero for land. */
	oceanWarmth: Float32Array
	/** Per-cell diffused coastal warmth on land: -1..+1. Zero for ocean and deep interior. */
	coastalWarmth: Float32Array
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
	return t * t * (3 - 2 * t)
}

/**
 * Laplacian smoothing restricted to ocean cells.
 */
function smoothOcean(
	mesh: SphereMesh,
	field: Float32Array,
	isLand: Uint8Array,
	passes: number,
): void {
	const { adjOffset, adjList, numRegions: N } = mesh
	const tmp = new Float32Array(N)
	for (let pass = 0; pass < passes; pass++) {
		for (let r = 0; r < N; r++) {
			if (isLand[r]) { tmp[r] = field[r]; continue }
			let sum = field[r], count = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!isLand[nb]) { sum += field[nb]; count++ }
			}
			tmp[r] = sum / count
		}
		field.set(tmp)
	}
}

/**
 * Compute ocean current warmth and diffused coastal warmth.
 *
 * Pipeline position: after computeAdvection (needs eastAdv, westAdv) and
 * computeTemperature (needs climate for TEQ).
 */
export function computeOceanCurrents(
	mesh: SphereMesh,
	eastAdv: Float32Array,
	westAdv: Float32Array,
	isLand: Uint8Array,
	climate: OrogenClimate,
	params?: Pick<OrogenParams, "planetRadiusKm">,
): OceanCurrentResult {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const avgEdgeKm = meanEdgeLengthKm(mesh, params?.planetRadiusKm)

	// ── Precompute lat/lon and TEQ ──────────────────────────────────────
	const latDeg = new Float32Array(N)
	const lonDeg = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		latDeg[r] = Math.asin(Math.max(-1, Math.min(1, z))) * RAD2DEG
		lonDeg[r] = Math.atan2(mesh.r_xyz[3 * r + 1], mesh.r_xyz[3 * r]) * RAD2DEG
	}

	const TEQ_BINS = 120
	const teqByBin = computeThermalEquator(mesh, climate.temperature_avg, TEQ_BINS)
	const lonBinWidth = 360 / TEQ_BINS

	function teqAt(r: number): number {
		const bin = Math.max(0, Math.min(TEQ_BINS - 1,
			Math.floor((lonDeg[r] + 180) / lonBinWidth)))
		return teqByBin[bin]
	}

	// ── Step 1: Classify coastal ocean cells as warm or cold ────────────
	// A coastal ocean cell is one adjacent to at least one land cell.
	// Sample the dominant advection field from neighboring land to determine
	// which wind regime is pushing moisture (and thus water) here.
	//
	// Trades (near TEQ): eastAdv dominates → water piled on western coast → warm
	// Westerlies (far from TEQ): westAdv dominates → warm on western boundary too
	//   (western intensification: poleward return flow is warm)
	//
	// The sign convention:
	//   warmth > 0 = warm current (western boundary / trade accumulation side)
	//   warmth < 0 = cold current (eastern boundary / upwelling side)

	const oceanWarmth = new Float32Array(N)

	// Threshold in BFS hops for warmth fade (~800 km worth of hops)
	const fadeHops = Math.max(5, Math.round(800 / avgEdgeKm))

	// Smooth bell-shaped strength envelopes for each wind regime.
	// Raised cosine: peaks at center, tapers to zero over the full width.
	// No flat plateaus — strength is always changing, giving gradual transitions.
	//   Trades:     center ~18° from TEQ, half-width 16° (covers ~2–34°)
	//   Westerlies: center ~45°,         half-width 16° (covers ~29–61°)
	//   Polar:      center ~72°,         half-width 14° (covers ~58–86°), weak
	function bell(d: number, center: number, halfWidth: number): number {
		const x = Math.abs(d - center) / halfWidth
		if (x >= 1) return 0
		return 0.5 * (1 + Math.cos(Math.PI * x))
	}
	function tradeStrength(d: number): number {
		// Asymmetric: slower ramp from ITCZ side (extra suppression near equator)
		const base = bell(d, 18, 16)
		const itczSuppression = d < 8 ? smoothstep(8, 3, d) : 0
		return base * (1 - itczSuppression)
	}
	function westerliesStrength(d: number): number {
		return bell(d, 45, 16)
	}
	function polarStrength(d: number): number {
		return bell(d, 72, 14) * 0.4
	}

	// First pass: seed coastal ocean cells
	const coastalSeeds: number[] = []
	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue

		// Check if this ocean cell is adjacent to land
		let landEast = 0, landWest = 0, landCount = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb]) {
				landCount++
				landEast += eastAdv[nb]
				landWest += westAdv[nb]
			}
		}
		if (landCount === 0) continue

		// Average advection from neighboring land
		const avgEast = landEast / landCount
		const avgWest = landWest / landCount

		const teq = teqAt(r)
		const distFromTeq = Math.abs(latDeg[r] - teq)

		// Evaluate each regime's contribution, weighted by its envelope
		let warmth = 0

		// Trade wind contribution
		const tStr = tradeStrength(distFromTeq)
		if (tStr > 0) {
			let tw = 0
			if (avgEast > avgWest + 0.05) tw = 0.8        // warm: trade accumulation (western coast)
			else if (avgWest > avgEast + 0.05) tw = -0.6   // cold: upwelling (eastern coast)
			warmth += tw * tStr
		}

		// Westerlies contribution
		const wStr = westerliesStrength(distFromTeq)
		if (wStr > 0) {
			let ww = 0
			if (avgWest > avgEast + 0.05) ww = 0.6        // warm: western boundary poleward flow
			else if (avgEast > avgWest + 0.05) ww = -0.5   // cold: eastern boundary equatorward flow
			warmth += ww * wStr
		}

		// Polar contribution (weak, generally cold)
		const pStr = polarStrength(distFromTeq)
		if (pStr > 0) {
			warmth += -0.2 * pStr
		}

		oceanWarmth[r] = Math.max(-1, Math.min(1, warmth))
		if (Math.abs(warmth) > 0.01) coastalSeeds.push(r)
	}

	// ── Step 2: BFS warmth through ocean cells with distance fade ───────
	const dist = new Int32Array(N).fill(-1)
	const queue = new Int32Array(N)
	let qLen = 0

	for (const s of coastalSeeds) {
		dist[s] = 0
		queue[qLen++] = s
	}

	let head = 0
	while (head < qLen) {
		const r = queue[head++]
		const d = dist[r] + 1
		if (d >= fadeHops) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && dist[nb] === -1) {
				dist[nb] = d
				// Fade warmth with distance
				const fade = 1 - d / fadeHops
				oceanWarmth[nb] = oceanWarmth[r] * fade
				queue[qLen++] = nb
			}
		}
	}

	// ── Step 3: Smooth ocean warmth ─────────────────────────────────────
	const smoothPasses = Math.max(3, Math.round(500 / avgEdgeKm))
	smoothOcean(mesh, oceanWarmth, isLand, smoothPasses)

	// Clamp to [-1, 1]
	for (let r = 0; r < N; r++) {
		oceanWarmth[r] = Math.max(-1, Math.min(1, oceanWarmth[r]))
		if (isLand[r]) oceanWarmth[r] = 0
	}

	// ── Step 4: Diffuse warmth onto coastal land ────────────────────────
	// BFS from coastal land cells, seeded with average warmth of adjacent
	// ocean neighbors, fading with hop distance inland (~600 km range).
	const coastalWarmth = new Float32Array(N)
	const landFadeHops = Math.max(4, Math.round(600 / avgEdgeKm))
	const landDist = new Int32Array(N).fill(-1)
	const landQueue = new Int32Array(N)
	let lqLen = 0

	// Seed: land cells adjacent to ocean
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let warmSum = 0, oceanCount = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb]) {
				warmSum += oceanWarmth[nb]
				oceanCount++
			}
		}
		if (oceanCount === 0) continue
		coastalWarmth[r] = warmSum / oceanCount
		landDist[r] = 0
		landQueue[lqLen++] = r
	}

	head = 0
	while (head < lqLen) {
		const r = landQueue[head++]
		const d = landDist[r] + 1
		if (d >= landFadeHops) continue
		const fade = 1 - d / landFadeHops
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] && landDist[nb] === -1) {
				landDist[nb] = d
				coastalWarmth[nb] = coastalWarmth[r] * fade
				landQueue[lqLen++] = nb
			}
		}
	}

	// Light smoothing on land
	const landSmooth = new Float32Array(N)
	for (let pass = 0; pass < 2; pass++) {
		for (let r = 0; r < N; r++) {
			if (!isLand[r]) { landSmooth[r] = 0; continue }
			let sum = coastalWarmth[r], count = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (isLand[nb]) { sum += coastalWarmth[nb]; count++ }
			}
			landSmooth[r] = sum / count
		}
		for (let r = 0; r < N; r++) {
			if (isLand[r]) coastalWarmth[r] = landSmooth[r]
		}
	}

	return { oceanWarmth, coastalWarmth }
}

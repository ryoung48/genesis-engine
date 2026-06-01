import type { OrogenParams, SphereMesh } from ".."

/**
 * Returns a Uint8Array where 1 = land cell that borders at least one non-land
 * (ocean or lake) neighbour.  Shared by the tidal model and classifyTopography
 * so the O(N×6) adjacency scan is not duplicated.
 */
export function computeCoastalMask(
	mesh: SphereMesh,
	isLand: Uint8Array,
): Uint8Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const coastal = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			if (!isLand[adjList[j]]) {
				coastal[r] = 1
				break
			}
		}
	}
	return coastal
}

// Calibrated so tidalStrength=1.0 (Earth) yields ~86% micro (<1 m),
// 13% meso (1–3 m), 1% macro (up to 16 m) of coastal cells.
const BASE_TIDAL_RANGE_M = 0.5

// Enclosure → bay amplification (open headland → Bay-of-Fundy scale).
const ENC_BREAKS = [0, 0.3, 0.6, 0.8, 1.0]
const AMP_VALUES = [1, 2, 6, 16, 32]

function piecewiseAmp(enclosure: number): number {
	for (let i = 0; i < ENC_BREAKS.length - 1; i++) {
		const a = ENC_BREAKS[i]!
		const b = ENC_BREAKS[i + 1]!
		if (enclosure <= b) {
			const t = (enclosure - a) / (b - a)
			return AMP_VALUES[i]! + t * (AMP_VALUES[i + 1]! - AMP_VALUES[i]!)
		}
	}
	return AMP_VALUES[AMP_VALUES.length - 1]!
}

// Green's law: tidal amplitude ∝ h^(-1/4).  Applied once at the end so it
// never feeds back into the Dijkstra propagation and cannot compound.
function depthFactor(depthKm: number): number {
	return Math.pow(0.1 / Math.max(0.001, depthKm), 0.25)
}

// e-folding distance for tidal energy propagation through ocean (km).
const DECAY_KM = 1500

/**
 * Computes a per-cell tidal range in **metres** (raw, not normalised).
 *
 * Coastal land cells: enclosure-based amplification (bay geometry proxy).
 *
 * Ocean cells: Dijkstra propagation from coastal-land sources using actual km
 * distances so decay is exp(−km/DECAY_KM) — always < 1, never amplifies.
 * Green's-law depth factor is applied once to the final ocean values only.
 *
 * Lakes and inland land: 0.
 */
export function computeTidalRange(
	mesh: SphereMesh,
	isLand: Uint8Array,
	isCoastal: Uint8Array,
	elevationKm: Float32Array,
	params: Pick<OrogenParams, "tidalStrength" | "tidallyLocked" | "planetRadiusKm">,
	lakes?: Uint8Array,
): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList, neighborDist } = mesh
	const tidalStrength = params.tidalStrength ?? 1.0
	const planetRadiusKm = params.planetRadiusKm ?? 6371

	if (params.tidallyLocked || tidalStrength <= 0) return new Float32Array(N)

	const isOcean = (r: number) => !isLand[r] && !lakes?.[r]

	// ── Step 1: Coastal land cell values ──────────────────────────────
	const result = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (!isCoastal[r]) continue
		let oceanCount = 0
		let totalCount = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			totalCount++
			if (!isLand[adjList[j]]) oceanCount++
		}
		if (totalCount === 0) continue
		const enclosure = 1 - oceanCount / totalCount
		result[r] = tidalStrength * BASE_TIDAL_RANGE_M * piecewiseAmp(enclosure)
	}

	// ── Step 2: Dijkstra propagation from coastal land → ocean ─────────
	// f[r] = max_c( result[c] × exp(−km_dist(r,c) / DECAY_KM) )
	// Processed highest-value-first; since exp(−d/D) < 1 for all d > 0,
	// the value at every ocean cell can only be ≤ its source, guaranteeing
	// the first-visit value is always the maximum.

	const f = new Float32Array(N)

	// Min-heap storing [−value, region] so highest value is popped first.
	const hPri: number[] = []
	const hIdx: number[] = []

	function hPush(pri: number, r: number): void {
		hPri.push(pri)
		hIdx.push(r)
		let i = hPri.length - 1
		while (i > 0) {
			const p = (i - 1) >> 1
			if (hPri[p]! <= hPri[i]!) break
			;[hPri[p], hPri[i]] = [hPri[i]!, hPri[p]!]
			;[hIdx[p], hIdx[i]] = [hIdx[i]!, hIdx[p]!]
			i = p
		}
	}

	function hPop(): [number, number] {
		const topPri = hPri[0]!
		const topIdx = hIdx[0]!
		const lp = hPri.pop()!
		const li = hIdx.pop()!
		if (hPri.length > 0) {
			hPri[0] = lp
			hIdx[0] = li
			let i = 0
			for (;;) {
				let s = i
				const l = 2 * i + 1
				const r = 2 * i + 2
				if (l < hPri.length && hPri[l]! < hPri[s]!) s = l
				if (r < hPri.length && hPri[r]! < hPri[s]!) s = r
				if (s === i) break
				;[hPri[s], hPri[i]] = [hPri[i]!, hPri[s]!]
				;[hIdx[s], hIdx[i]] = [hIdx[i]!, hIdx[s]!]
				i = s
			}
		}
		return [topPri, topIdx]
	}

	// Seed: all coastal land cells
	for (let r = 0; r < N; r++) {
		if (result[r] > 0 && isLand[r]) {
			f[r] = result[r]
			hPush(-result[r], r)
		}
	}

	while (hPri.length > 0) {
		const [negVal, r] = hPop()
		const val = -negVal
		if (val < f[r] - 1e-6) continue // stale entry

		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isOcean(nb)) continue

			const edgeKm = (neighborDist[j] ?? 0) * planetRadiusKm
			const propagated = val * Math.exp(-edgeKm / DECAY_KM)
			if (propagated > f[nb] + 1e-6) {
				f[nb] = propagated
				hPush(-propagated, nb)
			}
		}
	}

	// ── Step 3: Apply depth factor to ocean cells ──────────────────────
	for (let r = 0; r < N; r++) {
		if (!isOcean(r)) continue
		if (f[r] <= 0) continue
		result[r] = f[r] * depthFactor(Math.max(0.001, -elevationKm[r]))
	}

	return result
}

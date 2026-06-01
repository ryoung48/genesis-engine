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
const BASE_TIDAL_RANGE_M = 0.25

// Enclosure → bay amplification.  The reachable range for a coastal cell in a
// 6-neighbour hex mesh is [0, 0.833] (minimum 1 ocean neighbour out of 6).
// 7-neighbour and 8-neighbour irregular cells can reach 0.857–0.875.
//
//  enc=0    — open headland / island tip   → 1×   ~0.25 m  (micro)
//  enc=0.5  — straight coast (3/6 ocean)   → 2×   ~0.50 m  (micro)
//  enc=0.67 — slightly recessed (2/6)       → 3×   ~0.75 m  (micro)
//  enc=0.833— tightest hex cell (1/6)       → 6×   ~1.50 m  (meso, typical small bay)
//  enc=0.875— tight 8-neighbour cell        → 20×  ~5.00 m  (macro, rare deep inlet)
const ENC_BREAKS = [0, 0.5, 0.67, 0.833, 0.92]
const AMP_VALUES = [1, 2, 3, 6, 96]

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

// e-folding distance for tidal energy propagation through ocean (km).
const DECAY_KM = 400

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
	params: Pick<
		OrogenParams,
		"tidalStrength" | "tidallyLocked" | "planetRadiusKm"
	>,
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

	// ── Step 3: Copy propagated values into ocean cells ───────────────
	for (let r = 0; r < N; r++) {
		if (!isOcean(r)) continue
		result[r] = f[r]
	}

	return result
}

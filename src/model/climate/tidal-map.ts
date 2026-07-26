import type { GenesisParams, SphereMesh } from ".."
import { makeRng } from "../shared"
import type { GenesisLandmarks } from "../terrain"
import { LANDMARK_TYPE_LAKE } from "../terrain"
import type { TidalSchedule } from "./tidal-schedule"

const BASE_TIDAL_RANGE_M = 0.25

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

const DECAY_KM = 400

export interface ComputeSpringTideMapInput {
	mesh: SphereMesh
	isLand: Uint8Array
	isCoastal: Uint8Array
	schedule: TidalSchedule
	params: Pick<GenesisParams, "seed" | "planetRadiusKm">
	/** Landmarks are absent when terrain landmark generation is disabled. */
	landmarks?: Pick<GenesisLandmarks, "regionLandmark" | "type">
}

export function computeSpringTideMap({
	mesh,
	isLand,
	isCoastal,
	schedule,
	params,
	landmarks,
}: ComputeSpringTideMapInput): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList, neighborDist } = mesh
	const { maxForce } = schedule

	if (maxForce <= 0) return new Float32Array(N)

	const rng = makeRng(params.seed ^ 0x7a3f)
	const planetRadiusKm = params.planetRadiusKm

	function isLandmarkLake(r: number): boolean {
		if (!landmarks) return false
		const lid = landmarks.regionLandmark[r]
		return lid >= 0 && landmarks.type[lid] === LANDMARK_TYPE_LAKE
	}
	const isOcean = (r: number) => !isLand[r] && !isLandmarkLake(r)

	// Scale tidal range by spring tide force relative to Earth
	const tidalStrength = maxForce

	// ── Step 1: Coastal land cell values (enclosure amplification) ────────
	const result = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (!isCoastal[r]) continue
		let oceanCount = 0
		let totalCount = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			totalCount++
			if (isOcean(adjList[j])) oceanCount++
		}
		if (totalCount === 0 || oceanCount === 0) continue
		const enclosure = 1 - oceanCount / totalCount
		result[r] = tidalStrength * BASE_TIDAL_RANGE_M * piecewiseAmp(enclosure)
	}

	// ── Step 1b: Tier randomisation ───────────────────────────────────────
	const MACRO_MAX_M = Math.min(11 * tidalStrength, 60)
	const MACRO_THRESHOLD_M = MACRO_MAX_M * (3 / 11)
	const MESO_THRESHOLD_M = MACRO_MAX_M * (1 / 11)
	const TARGET_MACRO_FRACTION = 0.01
	const TARGET_MESO_FRACTION = 0.13

	const coastalIndices: number[] = []
	for (let r = 0; r < N; r++) {
		if (result[r] > 0) coastalIndices.push(r)
	}
	if (coastalIndices.length > 0) {
		// biome-ignore lint/nursery/useMaxParams: native sort callback signature
		coastalIndices.sort((a, b) => result[b]! - result[a]!)
		const macroCount = Math.ceil(coastalIndices.length * TARGET_MACRO_FRACTION)
		const mesoCount = Math.ceil(coastalIndices.length * TARGET_MESO_FRACTION)
		for (let i = 0; i < coastalIndices.length; i++) {
			const r = coastalIndices[i]!
			if (i < macroCount) {
				result[r] =
					MACRO_THRESHOLD_M + rng() ** 2 * (MACRO_MAX_M - MACRO_THRESHOLD_M)
			} else if (i < macroCount + mesoCount) {
				result[r] =
					MESO_THRESHOLD_M + rng() * (MACRO_THRESHOLD_M - MESO_THRESHOLD_M)
			} else {
				result[r] = rng() * MESO_THRESHOLD_M
			}
		}
	}

	// ── Step 2: Dijkstra propagation coastal land → ocean ─────────────────
	const f = new Float32Array(N)
	const hPri: number[] = []
	const hIdx: number[] = []

	function hPush({ pri, r }: { pri: number; r: number }): void {
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

	for (let r = 0; r < N; r++) {
		if (result[r] > 0 && isLand[r]) {
			f[r] = result[r]
			hPush({ pri: -result[r], r })
		}
	}

	while (hPri.length > 0) {
		const [negVal, r] = hPop()
		const val = -negVal
		if (val < f[r] - 1e-6) continue

		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isOcean(nb)) continue
			const edgeKm = (neighborDist[j] ?? 0) * planetRadiusKm
			const propagated = val * Math.exp(-edgeKm / DECAY_KM)
			if (propagated > f[nb] + 1e-6) {
				f[nb] = propagated
				hPush({ pri: -propagated, r: nb })
			}
		}
	}

	for (let r = 0; r < N; r++) {
		if (!isOcean(r)) continue
		result[r] = f[r]
	}

	return result
}

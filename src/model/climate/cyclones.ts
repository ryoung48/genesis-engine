/**
 * Tropical cyclone (hurricane / typhoon) genesis and coastal risk model.
 *
 * Three-stage pipeline:
 *   1. Genesis potential — warm-enough ocean at the right latitude (Coriolis).
 *   2. Track propagation — BFS spread from genesis zones across open ocean.
 *   3. Coastal risk      — propagation onto adjacent land, decaying inland.
 *
 * Output is a single normalised [0, 1] Float32Array over all mesh regions.
 * Ocean cells encode genesis/track density; land cells encode strike risk.
 *
 * No cyclones form on tidally locked planets or when the day is long enough
 * that the Coriolis no-go zone around the thermal equator covers the entire
 * valid formation band (roughly hoursPerDay > 61 h).
 */

import { clamp, HOURS_PER_DAY, smoothstep } from "../shared"
import { TOPO_OCEAN } from "../terrain"
import { computeThermalEquator, getClimateGeometry } from "./rain"
import type { ComputeCycloneRiskParams } from "./types"

export function computeCycloneRisk({
	mesh,
	climate,
	isLand,
	topography,
	params,
	oceanCurrents,
}: ComputeCycloneRiskParams): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const { latDeg, regionBin } = getClimateGeometry(mesh)

	// Tidally locked: no meaningful Coriolis → no cyclones
	if (params.tideLock?.type === "solar") return new Float32Array(N)

	// Slow rotators: the Coriolis no-go zone (radius = geoTransitionLat degrees
	// from the thermal equator) engulfs the entire valid formation band (≤38°).
	const hoursPerDay = params.hoursPerDay ?? 24
	const noGoRadius = (15 * hoursPerDay) / HOURS_PER_DAY // same formula as wind model
	if (noGoRadius >= 38) return new Float32Array(N)

	// --- SST threshold: global mean + 11°C (≈26°C on Earth) ---
	let globalTempSum = 0
	for (let r = 0; r < N; r++) globalTempSum += climate.temperature_avg[r]
	const globalMeanTemp = globalTempSum / N
	const SST_THRESHOLD = globalMeanTemp + 11
	const SST_RANGE = 12 // full score at threshold + 12°C

	const annualTEQ = computeThermalEquator({
		mesh,
		temps: climate.temperature_avg,
	})

	// --- Step 1: Genesis potential (ocean cells only) ---
	const genesis = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		// Lakes (TOPO_LAKE) are excluded — only true open ocean cells can generate
		// cyclones. isLand is 0 for both ocean and lake so topography is the
		// reliable discriminator here.
		if (topography[r] !== TOPO_OCEAN) continue

		// Peak monthly SST over the annual cycle
		let peakTemp = -Infinity
		for (let m = 0; m < 12; m++) {
			const t = climate.temperature_monthly[m * N + r]
			if (t > peakTemp) peakTemp = t
		}

		const sstScore = clamp((peakTemp - SST_THRESHOLD) / SST_RANGE, 0, 1)
		if (sstScore <= 0) continue

		// Latitude from thermal equator — must be inside formation band
		const teq = annualTEQ[regionBin[r]]
		const distFromTeq = Math.abs(latDeg[r] - teq)

		// Smooth bell: zero within no-go zone, peaks midway, zero beyond 38°
		const latFactor =
			smoothstep(noGoRadius, noGoRadius + 8, distFromTeq) *
			(1 - smoothstep(30, 38, distFromTeq))
		if (latFactor <= 0) continue

		// Warm-current boost: hot currents raise effective SST
		let currentBoost = 1.0
		if (oceanCurrents?.oceanWarmth) {
			currentBoost = 1 + 0.4 * Math.max(0, oceanCurrents.oceanWarmth[r])
		}

		genesis[r] = sstScore * latFactor * currentBoost
	}

	// --- Step 2: BFS storm-track propagation across open ocean ---
	// Storms spread from genesis zones with exponential decay; land terminates.
	const TRACK_DECAY = 0.88
	const TRACK_MIN = 0.005

	const trackDensity = genesis.slice()
	const queue: number[] = []
	for (let r = 0; r < N; r++) {
		if (genesis[r] > TRACK_MIN) queue.push(r)
	}

	let head = 0
	while (head < queue.length) {
		const r = queue[head++]
		if (topography[r] !== TOPO_OCEAN) continue
		const propagated = trackDensity[r] * TRACK_DECAY
		if (propagated <= TRACK_MIN) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			// Storms die on land and lakes — don't propagate through either
			if (topography[nb] !== TOPO_OCEAN) continue
			if (propagated > trackDensity[nb] + 1e-4) {
				trackDensity[nb] = propagated
				queue.push(nb)
			}
		}
	}

	// --- Step 3: Coastal land risk ---
	// Seed from land cells adjacent to storm-track ocean; propagate 3 hops inland.
	const COASTAL_DECAY = 0.4
	const COASTAL_HOPS = 3

	const coastalRisk = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let maxAdj = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && trackDensity[nb] > maxAdj) maxAdj = trackDensity[nb]
		}
		coastalRisk[r] = maxAdj
	}

	for (let hop = 0; hop < COASTAL_HOPS; hop++) {
		const prev = coastalRisk.slice()
		for (let r = 0; r < N; r++) {
			if (!isLand[r]) continue
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!isLand[nb]) continue
				const p = prev[nb] * COASTAL_DECAY
				if (p > coastalRisk[r]) coastalRisk[r] = p
			}
		}
	}

	// --- Combine ocean track + land risk, then normalise ---
	const combined = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		combined[r] = isLand[r] ? coastalRisk[r] : trackDensity[r]
	}

	const nonZero: number[] = []
	for (let r = 0; r < N; r++) {
		if (combined[r] > 1e-5) nonZero.push(combined[r])
	}
	if (nonZero.length === 0) return combined

	// biome-ignore lint/nursery/useMaxParams: native sort callback
	nonZero.sort((a, b) => a - b)
	const p99 =
		nonZero[Math.min(nonZero.length - 1, Math.floor(0.99 * nonZero.length))]
	if (p99 <= 0) return combined

	const invP99 = 1 / p99
	for (let r = 0; r < N; r++) {
		combined[r] = Math.min(1, combined[r] * invP99)
	}
	return combined
}

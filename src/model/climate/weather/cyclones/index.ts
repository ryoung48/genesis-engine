import { RAIN } from "@/model/climate/precipitation/rain"
import type { ComputeCycloneRiskParams } from "@/model/climate/weather/cyclones/types"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { MATH } from "@/model/shared/math/core"
import { TIME } from "@/model/shared/time"

function computeCycloneRisk({
	mesh,
	climate,
	isLand,
	topography,
	params,
	oceanCurrents,
}: ComputeCycloneRiskParams): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const { latDeg, regionBin } = RAIN.getClimateGeometry(mesh)

	// Tidally locked: no meaningful Coriolis → no cyclones
	if (params.tideLock?.type === "solar") return new Float32Array(N)

	// Slow rotators: the Coriolis no-go zone (radius = geoTransitionLat degrees
	// from the thermal equator) engulfs the entire valid formation band (≤38°).
	const hoursPerDay = params.hoursPerDay ?? 24
	const noGoRadius = (15 * hoursPerDay) / TIME.hoursPerDay // same formula as wind model
	if (noGoRadius >= 38) return new Float32Array(N)

	// --- SST threshold: global mean + 11°C (≈26°C on Earth) ---
	let globalTempSum = 0
	for (let r = 0; r < N; r++) globalTempSum += climate.temperature_avg[r]
	const globalMeanTemp = globalTempSum / N
	const SST_THRESHOLD = globalMeanTemp + 11
	const SST_RANGE = 12 // full score at threshold + 12°C

	const annualTEQ = RAIN.computeThermalEquator({
		mesh,
		temps: climate.temperature_avg,
	})

	// --- Step 1: Genesis potential (ocean cells only) ---
	const genesis = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		// Lakes (TOPO_LAKE) are excluded — only true open ocean cells can generate
		// cyclones. isLand is 0 for both ocean and lake so topography is the
		// reliable discriminator here.
		if (topography[r] !== CLASSIFICATION.topoOcean) continue

		// Peak monthly SST over the annual cycle
		let peakTemp = -Infinity
		for (let m = 0; m < 12; m++) {
			const t = climate.temperature_monthly[m * N + r]
			if (t > peakTemp) peakTemp = t
		}

		const sstScore = MATH.clamp({
			value: (peakTemp - SST_THRESHOLD) / SST_RANGE,
			lo: 0,
			hi: 1,
		})
		if (sstScore <= 0) continue

		// Latitude from thermal equator — must be inside formation band
		const teq = annualTEQ[regionBin[r]]
		const distFromTeq = Math.abs(latDeg[r] - teq)

		// Smooth bell: zero within no-go zone, peaks midway, zero beyond 38°
		const latFactor =
			MATH.smoothstep({
				edge0: noGoRadius,
				edge1: noGoRadius + 8,
				x: distFromTeq,
			}) *
			(1 - MATH.smoothstep({ edge0: 30, edge1: 38, x: distFromTeq }))
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
		if (topography[r] !== CLASSIFICATION.topoOcean) continue
		const propagated = trackDensity[r] * TRACK_DECAY
		if (propagated <= TRACK_MIN) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			// Storms die on land and lakes — don't propagate through either
			if (topography[nb] !== CLASSIFICATION.topoOcean) continue
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

export const CYCLONES = {
	computeCycloneRisk,
}

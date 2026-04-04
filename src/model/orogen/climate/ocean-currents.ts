/**
 * Ocean current warmth model.
 *
 * Seeds warm/cold coastal ocean cells from continental coastline geometry plus
 * TEQ-relative latitude bands, then propagates that signal offshore and onto
 * nearby continental land.
 */
import type { SphereMesh, OrogenClimate, OrogenParams } from "../types"
import type { OrogenLandmarks } from "../provinces/landmarks"
import { computeThermalEquator } from "./rain"
import { meanEdgeLengthKm } from "../units"

const RAD2DEG = 180 / Math.PI
const DEG2RAD = Math.PI / 180
const TYPE_CONTINENT = 0
const TYPE_LAKE = 5
const USE_COASTAL_SEED_SHORT_CIRCUIT = false

export interface OceanCurrentResult {
	/** Per-cell ocean warmth: -1 (cold) to +1 (warm). Zero for land. */
	oceanWarmth: Float32Array
	/** Per-cell diffused coastal warmth on land: -1..+1. Zero for ocean and deep interior. */
	coastalWarmth: Float32Array
	/** Per-cell temperature delta applied by ocean currents (°C). Zero where no effect. */
	temperatureDelta: Float32Array
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
	return t * t * (3 - 2 * t)
}

function piecewise(xs: number[], ys: number[], x: number): number {
	if (x <= xs[0]) return ys[0]
	for (let i = 1; i < xs.length; i++) {
		if (x <= xs[i]) {
			const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
			return ys[i - 1] + (ys[i] - ys[i - 1]) * t
		}
	}
	return ys[ys.length - 1]
}

function wrapLonDeltaDeg(delta: number): number {
	if (delta > 180) return delta - 360
	if (delta < -180) return delta + 360
	return delta
}

function directionalOceanOpen(
	start: number,
	dir: 1 | -1,
	mesh: SphereMesh,
	isLand: Uint8Array,
	isContinent: Uint8Array,
	isLake: Uint8Array,
	latDeg: Float32Array,
	lonDeg: Float32Array,
	maxSteps: number,
): number {
	const { adjOffset, adjList } = mesh
	const visited = new Uint8Array(mesh.numRegions)
	let current = start
	visited[current] = 1

	for (let step = 0; step < maxSteps; step++) {
		let bestOcean = -1
		let bestScore = -Infinity

		for (let j = adjOffset[current], jEnd = adjOffset[current + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (visited[nb] || isLake[nb]) continue

			const dLon = wrapLonDeltaDeg(lonDeg[nb] - lonDeg[current]) * dir
			const dLat = Math.abs(latDeg[nb] - latDeg[current])

			if (isContinent[nb] && dLon > 0.02 && dLat < 8) return -1
			if (isLand[nb]) continue
			if (dLon <= 0) continue

			const score = dLon - dLat * 0.2
			if (score > bestScore) {
				bestScore = score
				bestOcean = nb
			}
		}

		if (bestOcean < 0) return current
		current = bestOcean
		visited[current] = 1
	}

	return current
}

function propagateOceanInfluence(
	mesh: SphereMesh,
	isLand: Uint8Array,
	isLake: Uint8Array,
	seeds: Float32Array,
): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const influence = new Float32Array(N)
	const queue: number[] = []
	let head = 0

	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r] || seeds[r] <= 0) continue
		influence[r] = seeds[r]
		queue.push(r)
	}

	while (head < queue.length) {
		const r = queue[head++]
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] || isLake[nb]) continue
			if (influence[nb] > 0) continue
			influence[nb] = influence[r]
			queue.push(nb)
		}
	}

	return influence
}

function computeOceanSeedDistance(
	mesh: SphereMesh,
	isLand: Uint8Array,
	isLake: Uint8Array,
	seeds: Float32Array,
): Int32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const dist = new Int32Array(N).fill(-1)
	const queue = new Int32Array(N)
	let head = 0
	let tail = 0

	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r] || seeds[r] <= 0) continue
		dist[r] = 0
		queue[tail++] = r
	}

	while (head < tail) {
		const r = queue[head++]
		const nextDist = dist[r] + 1
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] || isLake[nb] || dist[nb] >= 0) continue
			dist[nb] = nextDist
			queue[tail++] = nb
		}
	}

	return dist
}

/**
 * Compute ocean current warmth and diffused coastal warmth.
 *
 * Pipeline position: after computeTemperature and after an initial landmarks
 * pass on the pre-lake land mask.
 */
export function computeOceanCurrents(
	mesh: SphereMesh,
	isLand: Uint8Array,
	climate: OrogenClimate,
	distCoast: Float32Array,
	landmarks: OrogenLandmarks,
	params?: Pick<OrogenParams, "planetRadiusKm">,
): OceanCurrentResult {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const avgEdgeKm = meanEdgeLengthKm(mesh, params?.planetRadiusKm)

	const latDeg = new Float32Array(N)
	const lonDeg = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		latDeg[r] = Math.asin(Math.max(-1, Math.min(1, z))) * RAD2DEG
		lonDeg[r] = Math.atan2(mesh.r_xyz[3 * r + 1], mesh.r_xyz[3 * r]) * RAD2DEG
	}

	const isContinent = new Uint8Array(N)
	const isLake = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		const landmark = landmarks.regionLandmark[r]
		if (landmark < 0) continue
		const type = landmarks.type[landmark]
		if (isLand[r] && type === TYPE_CONTINENT) isContinent[r] = 1
		if (!isLand[r] && type === TYPE_LAKE) isLake[r] = 1
	}

	const oceanWarmth = new Float32Array(N)

	function tradeStrength(d: number): number {
		return d >= 5 && d <= 30 ? 1 : 0
	}
	function westerliesStrength(d: number): number {
		return d >= 30 && d <= 70 ? 1 : 0
	}
	function polarStrength(d: number): number {
		return d >= 70 && d <= 90 ? 1 : 0
	}

	const coastMask = new Uint8Array(N)
	const localZonal = new Float32Array(N)
	const localMeridional = new Float32Array(N)
	const coastOceanCount = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		if (!isContinent[r]) continue
		let zonal = 0
		let meridional = 0
		let oceanCount = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] || isLake[nb]) continue
			oceanCount++
			const dLonDeg = wrapLonDeltaDeg(lonDeg[nb] - lonDeg[r])
			const meanLatRad = ((latDeg[r] + latDeg[nb]) * 0.5) * DEG2RAD
			zonal += dLonDeg * Math.cos(meanLatRad)
			meridional += latDeg[nb] - latDeg[r]
		}
		if (oceanCount === 0) continue
		coastMask[r] = 1
		localZonal[r] = zonal
		localMeridional[r] = meridional
		coastOceanCount[r] = oceanCount
	}

	const openScanSteps = Math.max(1, Math.round(4000 / avgEdgeKm))
	const openOceanCoastKm = 300

	// Strict coastal orientation filter: only strongly east/west-facing continental margins seed currents.
	const warmSeed = new Float32Array(N)
	const coldSeed = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (!coastMask[r]) continue

		const oceanNeighbors: number[] = []
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] || isLake[nb]) continue
			oceanNeighbors.push(nb)
		}
		if (oceanNeighbors.length === 0) continue

		if (coastOceanCount[r] >= 3 && oceanNeighbors.length <= 3) continue
		const zonal = localZonal[r]
		const meridional = localMeridional[r]
		const absZonal = Math.abs(zonal)
		const absMeridional = Math.abs(meridional)
		if (absZonal < 0.2 || absZonal < absMeridional * 1) continue

		const eastFacing = zonal > 0
		let hasOpenOcean = false
		for (const nb of oceanNeighbors) {
			const dLon = wrapLonDeltaDeg(lonDeg[nb] - lonDeg[r])
			if ((eastFacing && dLon <= 0) || (!eastFacing && dLon >= 0)) continue
			const scanEnd = directionalOceanOpen(nb, eastFacing ? 1 : -1, mesh, isLand, isContinent, isLake, latDeg, lonDeg, openScanSteps)
			if (scanEnd >= 0 && distCoast[scanEnd] * avgEdgeKm >= openOceanCoastKm) {
				hasOpenOcean = true
				break
			}
		}
		if (!hasOpenOcean) continue

		const distFromEquator = Math.abs(latDeg[r])

		let warmth = 0

		const tStr = tradeStrength(distFromEquator)
		if (tStr > 0) warmth += (eastFacing ? 1 : -1) * tStr

		const wStr = westerliesStrength(distFromEquator)
		if (wStr > 0) warmth += (eastFacing ? -1 : 1) * wStr

		const pStr = polarStrength(distFromEquator)
		if (pStr > 0) warmth += -1 * pStr

		if (Math.abs(warmth) <= 0.01) continue
		warmth = warmth > 0 ? 1 : -1

		for (const nb of oceanNeighbors) {
			if (warmth > 0) warmSeed[nb] = Math.max(warmSeed[nb], warmth)
			else coldSeed[nb] = Math.max(coldSeed[nb], -warmth)
		}
	}

	if (USE_COASTAL_SEED_SHORT_CIRCUIT) {
		for (let r = 0; r < N; r++) {
			if (isLand[r] || isLake[r]) continue
			const warm = warmSeed[r]
			const cold = coldSeed[r]
			const total = warm + cold
			if (total <= 0.001) continue
			oceanWarmth[r] = (warm - cold) / total
		}
	} else {
		for (let r = 0; r < N; r++) {
			if (isLand[r] || isLake[r]) continue
			const distFromEquator = Math.abs(latDeg[r])
			if (distFromEquator <= 10) warmSeed[r] = 1
			if (distFromEquator >= 68) {
				const polarSeed = Math.min(1, (distFromEquator - 68) / 10)
				coldSeed[r] = Math.max(coldSeed[r], 0.35 + polarSeed * 0.55)
			}
		}

		const warmInfluence = propagateOceanInfluence(mesh, isLand, isLake, warmSeed)
		const coldInfluence = propagateOceanInfluence(mesh, isLand, isLake, coldSeed)
		const warmDist = computeOceanSeedDistance(mesh, isLand, isLake, warmSeed)
		const coldDist = computeOceanSeedDistance(mesh, isLand, isLake, coldSeed)

		for (let r = 0; r < N; r++) {
			if (isLand[r] || isLake[r]) continue
			const warm = warmInfluence[r]
			const cold = coldInfluence[r]
			if (warm <= 0.001 && cold <= 0.001) continue
			if (warm > 0.001 && cold <= 0.001) { oceanWarmth[r] = 1; continue }
			if (cold > 0.001 && warm <= 0.001) { oceanWarmth[r] = -1; continue }

			const wDist = Math.max(0, warmDist[r])
			const cDist = Math.max(0, coldDist[r])
			const wScore = 1 / (1 + wDist)
			const cScore = 1 / (1 + cDist)
			oceanWarmth[r] = (wScore - cScore) / (wScore + cScore)
		}
	}

	for (let r = 0; r < N; r++) {
		oceanWarmth[r] = Math.max(-1, Math.min(1, oceanWarmth[r]))
		if (isLand[r]) oceanWarmth[r] = 0
	}

	const coastalWarmth = new Float32Array(N)
	const landFadeHops = Math.max(4, Math.round(600 / avgEdgeKm))
	const landDist = new Int32Array(N).fill(-1)
	const landQueue = new Int32Array(N)
	let lqLen = 0
	let landHead = 0

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let warmSum = 0
		let oceanCount = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && !isLake[nb]) {
				warmSum += oceanWarmth[nb]
				oceanCount++
			}
		}
		if (oceanCount === 0) continue
		coastalWarmth[r] = warmSum / oceanCount
		landDist[r] = 0
		landQueue[lqLen++] = r
	}

	while (landHead < lqLen) {
		const r = landQueue[landHead++]
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

	return { oceanWarmth, coastalWarmth, temperatureDelta: new Float32Array(N) }
}

/**
 * Apply ocean current temperature effects to the climate in-place.
 *
 * Warm currents (Gulf Stream, Kuroshio) raise SST and coastal land temps;
 * cold currents (California, Benguela, Humboldt) lower them.
 *
 * Ocean:  up to ±5°C for strong currents
 * Land:   up to ±3°C at coast, fading inland (coastalWarmth already fades)
 */
export function applyCurrentTemperatureEffect(
	mesh: SphereMesh,
	climate: OrogenClimate,
	isLand: Uint8Array,
	currents: OceanCurrentResult,
): void {
	const N = mesh.numRegions
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

	for (let r = 0; r < N; r++) {
		const w = isLand[r] ? currents.coastalWarmth[r] : currents.oceanWarmth[r]
		if (Math.abs(w) < 0.01) continue

		const distFromTEQ = Math.abs(latDeg[r] - teqAt(r))
		const warmMaxAtLat = piecewise([0, 20, 40, 60, 80], [1, 2, 8, 15, 10], distFromTEQ)
		const coldMaxAtLat = piecewise([0, 20, 40, 60, 80], [1, 2, 5, 10, 7], distFromTEQ)
		let maxEffect = w > 0 ? warmMaxAtLat : coldMaxAtLat
		if (isLand[r]) maxEffect *= 0.6
		const delta = w * maxEffect

		currents.temperatureDelta[r] = delta
		climate.temperature_avg[r] += delta
		climate.temperature_min[r] += delta
		climate.temperature_max[r] += delta
		for (let m = 0; m < 12; m++) {
			climate.temperature_monthly[m * N + r] += delta
		}
	}
}

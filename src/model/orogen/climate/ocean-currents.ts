/**
 * Ocean current warmth model.
 *
 * Seeds warm/cold coastal ocean cells from continental coastline geometry plus
 * TEQ-relative latitude bands, then propagates that signal offshore and onto
 * nearby continental land.
 */

import type { OrogenLandmarks } from "../provinces/landmarks"
import type { OrogenClimate, OrogenParams, SphereMesh } from "../types"
import { meanEdgeLengthKm } from "../units"
import { computeThermalEquator } from "./rain"

const RAD2DEG = 180 / Math.PI
const DEG2RAD = Math.PI / 180
const TYPE_CONTINENT = 0
const TYPE_LAKE = 5
const CURRENT_EFFECT_MONTHS = 12
const TEQ_BINS = 120
const WARM_EFFECT_XS = [0, 20, 40, 60, 80]
const WARM_EFFECT_YS = [1, 2, 8, 15, 10]
const COLD_EFFECT_YS = [1, 2, 5, 10, 7]

export interface OceanCurrentResult {
	/** Per-cell ocean warmth: -1 (cold) to +1 (warm). Zero for land. */
	oceanWarmth: Float32Array
	/** Per-cell diffused coastal warmth on land: -1..+1. Zero for ocean and deep interior. */
	coastalWarmth: Float32Array
	/** Optional flattened monthly ocean warmth, [month * N + r]. */
	oceanWarmthMonthly?: Float32Array
	/** Optional flattened monthly coastal warmth, [month * N + r]. */
	coastalWarmthMonthly?: Float32Array
	/** Optional flattened monthly temperature delta, [month * N + r]. */
	temperatureDeltaMonthly?: Float32Array
	/** Per-cell temperature delta applied by ocean currents (°C). Zero where no effect. */
	temperatureDelta: Float32Array
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

function getRegionLatLonDegrees(mesh: SphereMesh): {
	latDeg: Float32Array
	lonDeg: Float32Array
} {
	const N = mesh.numRegions
	const latDeg = new Float32Array(N)
	const lonDeg = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		latDeg[r] = Math.asin(Math.max(-1, Math.min(1, z))) * RAD2DEG
		lonDeg[r] = Math.atan2(mesh.r_xyz[3 * r + 1], mesh.r_xyz[3 * r]) * RAD2DEG
	}
	return { latDeg, lonDeg }
}

interface CoastSite {
	region: number
	oceanNeighbors: number[]
	eastFacing: boolean
	lonBin: number
}

function classifyCurrentWarmth(
	distFromReference: number,
	eastFacing: boolean,
): number {
	let warmth = 0

	const tStr = distFromReference >= 5 && distFromReference <= 30 ? 1 : 0
	if (tStr > 0) warmth += eastFacing ? 1 : -1

	const wStr = distFromReference >= 30 && distFromReference <= 70 ? 1 : 0
	if (wStr > 0) warmth += eastFacing ? -1 : 1

	const pStr = distFromReference >= 70 && distFromReference <= 90 ? 1 : 0
	if (pStr > 0) warmth += -1

	if (Math.abs(warmth) <= 0.01) return 0
	return warmth > 0 ? 1 : -1
}

function fillOceanBeltSeeds(
	warmSeed: Float32Array,
	coldSeed: Float32Array,
	isLand: Uint8Array,
	isLake: Uint8Array,
	latDeg: Float32Array,
	lonBinByRegion: Int32Array,
	teqByLon?: Float32Array,
): void {
	const N = latDeg.length
	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r]) continue
		const distFromReference = teqByLon
			? Math.abs(latDeg[r] - teqByLon[lonBinByRegion[r]])
			: Math.abs(latDeg[r])
		if (distFromReference <= 10) warmSeed[r] = 1
		if (distFromReference >= 68) {
			const polarSeed = Math.min(1, (distFromReference - 68) / 10)
			coldSeed[r] = Math.max(coldSeed[r], 0.35 + polarSeed * 0.55)
		}
	}
}

function buildCoastSites(
	mesh: SphereMesh,
	isLand: Uint8Array,
	isContinent: Uint8Array,
	isLake: Uint8Array,
	latDeg: Float32Array,
	lonDeg: Float32Array,
	distCoast: Float32Array,
	avgEdgeKm: number,
): CoastSite[] {
	const { adjOffset, adjList } = mesh
	const openScanSteps = Math.max(1, Math.round(4000 / avgEdgeKm))
	const openOceanCoastKm = 300
	const lonBinWidth = 360 / TEQ_BINS
	const sites: CoastSite[] = []

	for (let r = 0; r < mesh.numRegions; r++) {
		if (!isContinent[r]) continue

		const oceanNeighbors: number[] = []
		let zonal = 0
		let meridional = 0
		let oceanCount = 0

		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] || isLake[nb]) continue
			oceanNeighbors.push(nb)
			oceanCount++
			const dLonDeg = wrapLonDeltaDeg(lonDeg[nb] - lonDeg[r])
			const meanLatRad = (latDeg[r] + latDeg[nb]) * 0.5 * DEG2RAD
			zonal += dLonDeg * Math.cos(meanLatRad)
			meridional += latDeg[nb] - latDeg[r]
		}

		if (oceanCount === 0) continue
		if (oceanCount >= 3 && oceanNeighbors.length <= 3) continue
		const absZonal = Math.abs(zonal)
		const absMeridional = Math.abs(meridional)
		if (absZonal < 0.2 || absZonal < absMeridional * 1) continue

		const eastFacing = zonal > 0
		let hasOpenOcean = false
		for (const nb of oceanNeighbors) {
			const dLon = wrapLonDeltaDeg(lonDeg[nb] - lonDeg[r])
			if ((eastFacing && dLon <= 0) || (!eastFacing && dLon >= 0)) continue
			const scanEnd = directionalOceanOpen(
				nb,
				eastFacing ? 1 : -1,
				mesh,
				isLand,
				isContinent,
				isLake,
				latDeg,
				lonDeg,
				openScanSteps,
			)
			if (scanEnd >= 0 && distCoast[scanEnd] * avgEdgeKm >= openOceanCoastKm) {
				hasOpenOcean = true
				break
			}
		}
		if (!hasOpenOcean) continue

		sites.push({
			region: r,
			oceanNeighbors,
			eastFacing,
			lonBin: Math.max(
				0,
				Math.min(TEQ_BINS - 1, Math.floor((lonDeg[r] + 180) / lonBinWidth)),
			),
		})
	}

	return sites
}

function computeOceanWarmthFromSeeds(
	mesh: SphereMesh,
	isLand: Uint8Array,
	isLake: Uint8Array,
	warmSeed: Float32Array,
	coldSeed: Float32Array,
): Float32Array {
	const warmDist = computeOceanSeedDistance(mesh, isLand, isLake, warmSeed)
	const coldDist = computeOceanSeedDistance(mesh, isLand, isLake, coldSeed)
	const oceanWarmth = new Float32Array(mesh.numRegions)

	for (let r = 0; r < mesh.numRegions; r++) {
		if (isLand[r] || isLake[r]) continue
		const warm = warmDist[r]
		const cold = coldDist[r]
		if (warm < 0 && cold < 0) continue
		if (warm >= 0 && cold < 0) {
			oceanWarmth[r] = 1
			continue
		}
		if (cold >= 0 && warm < 0) {
			oceanWarmth[r] = -1
			continue
		}

		const wDist = Math.max(0, warm)
		const cDist = Math.max(0, cold)
		const wScore = 1 / (1 + wDist)
		const cScore = 1 / (1 + cDist)
		oceanWarmth[r] = (wScore - cScore) / (wScore + cScore)
	}

	for (let r = 0; r < mesh.numRegions; r++) {
		if (isLand[r]) oceanWarmth[r] = 0
		else oceanWarmth[r] = Math.max(-1, Math.min(1, oceanWarmth[r]))
	}

	return oceanWarmth
}

function computeCoastalWarmthFromOceanWarmth(
	mesh: SphereMesh,
	isLand: Uint8Array,
	isLake: Uint8Array,
	oceanWarmth: Float32Array,
	avgEdgeKm: number,
): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
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

	return coastalWarmth
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

		for (
			let j = adjOffset[current], jEnd = adjOffset[current + 1];
			j < jEnd;
			j++
		) {
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
	monthlyTEQ?: Float32Array[],
): OceanCurrentResult {
	void climate
	const N = mesh.numRegions
	const avgEdgeKm = meanEdgeLengthKm(mesh, params?.planetRadiusKm)
	const { latDeg, lonDeg } = getRegionLatLonDegrees(mesh)
	const lonBinByRegion = new Int32Array(N)
	const lonBinWidth = 360 / TEQ_BINS
	for (let r = 0; r < N; r++) {
		lonBinByRegion[r] = Math.max(
			0,
			Math.min(TEQ_BINS - 1, Math.floor((lonDeg[r] + 180) / lonBinWidth)),
		)
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

	const coastSites = buildCoastSites(
		mesh,
		isLand,
		isContinent,
		isLake,
		latDeg,
		lonDeg,
		distCoast,
		avgEdgeKm,
	)

	const warmSeed = new Float32Array(N)
	const coldSeed = new Float32Array(N)

	fillOceanBeltSeeds(warmSeed, coldSeed, isLand, isLake, latDeg, lonBinByRegion)
	for (const site of coastSites) {
		const distFromEquator = Math.abs(latDeg[site.region])
		const warmth = classifyCurrentWarmth(distFromEquator, site.eastFacing)
		if (warmth > 0) {
			for (const nb of site.oceanNeighbors) warmSeed[nb] = 1
		} else if (warmth < 0) {
			for (const nb of site.oceanNeighbors) coldSeed[nb] = 1
		}
	}

	const oceanWarmth = computeOceanWarmthFromSeeds(
		mesh,
		isLand,
		isLake,
		warmSeed,
		coldSeed,
	)
	const coastalWarmth = computeCoastalWarmthFromOceanWarmth(
		mesh,
		isLand,
		isLake,
		oceanWarmth,
		avgEdgeKm,
	)

	let oceanWarmthMonthly: Float32Array | undefined
	let coastalWarmthMonthly: Float32Array | undefined
	let temperatureDeltaMonthly: Float32Array | undefined
	if (monthlyTEQ && monthlyTEQ.length === CURRENT_EFFECT_MONTHS) {
		oceanWarmthMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
		coastalWarmthMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
		temperatureDeltaMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
		const monthWarmSeed = new Float32Array(N)
		const monthColdSeed = new Float32Array(N)
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			monthWarmSeed.fill(0)
			monthColdSeed.fill(0)
			const teqByLon = monthlyTEQ[month]
			fillOceanBeltSeeds(
				monthWarmSeed,
				monthColdSeed,
				isLand,
				isLake,
				latDeg,
				lonBinByRegion,
				teqByLon,
			)
			for (const site of coastSites) {
				const distFromTeq = Math.abs(
					latDeg[site.region] - teqByLon[site.lonBin],
				)
				const warmth = classifyCurrentWarmth(distFromTeq, site.eastFacing)
				if (warmth > 0) {
					for (const nb of site.oceanNeighbors) monthWarmSeed[nb] = 1
				} else if (warmth < 0) {
					for (const nb of site.oceanNeighbors) monthColdSeed[nb] = 1
				}
			}
			const monthOceanWarmth = computeOceanWarmthFromSeeds(
				mesh,
				isLand,
				isLake,
				monthWarmSeed,
				monthColdSeed,
			)
			oceanWarmthMonthly.set(monthOceanWarmth, month * N)
			const monthCoastalWarmth = computeCoastalWarmthFromOceanWarmth(
				mesh,
				isLand,
				isLake,
				monthOceanWarmth,
				avgEdgeKm,
			)
			coastalWarmthMonthly.set(monthCoastalWarmth, month * N)
		}
	}

	return {
		oceanWarmth,
		coastalWarmth,
		oceanWarmthMonthly,
		coastalWarmthMonthly,
		temperatureDeltaMonthly,
		temperatureDelta: new Float32Array(N),
	}
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
	monthlyTEQ?: Float32Array[],
): void {
	const N = mesh.numRegions
	const { latDeg, lonDeg } = getRegionLatLonDegrees(mesh)
	const regionBin = new Int32Array(N)
	const teqByBin =
		monthlyTEQ && monthlyTEQ.length === CURRENT_EFFECT_MONTHS
			? undefined
			: computeThermalEquator(mesh, climate.temperature_avg, TEQ_BINS)
	const lonBinWidth = 360 / TEQ_BINS
	const hasMonthlyCurrents =
		!!currents.oceanWarmthMonthly &&
		!!currents.coastalWarmthMonthly &&
		!!monthlyTEQ &&
		monthlyTEQ.length === CURRENT_EFFECT_MONTHS
	const temperatureDeltaMonthly =
		currents.temperatureDeltaMonthly ??
		(currents.temperatureDeltaMonthly = new Float32Array(
			N * CURRENT_EFFECT_MONTHS,
		))

	function teqAt(r: number): number {
		const bin = regionBin[r]
		return teqByBin ? teqByBin[bin] : 0
	}

	for (let r = 0; r < N; r++) {
		regionBin[r] = Math.max(
			0,
			Math.min(TEQ_BINS - 1, Math.floor((lonDeg[r] + 180) / lonBinWidth)),
		)
	}

	if (hasMonthlyCurrents) {
		const oceanWarmthMonthly = currents.oceanWarmthMonthly!
		const coastalWarmthMonthly = currents.coastalWarmthMonthly!
		for (let r = 0; r < N; r++) {
			let annualDelta = 0
			const bin = regionBin[r]
			for (let m = 0; m < CURRENT_EFFECT_MONTHS; m++) {
				const w = isLand[r]
					? coastalWarmthMonthly[m * N + r]
					: oceanWarmthMonthly[m * N + r]
				if (Math.abs(w) < 0.01) continue
				const teq = monthlyTEQ![m][bin]
				const distFromTEQ = Math.abs(latDeg[r] - teq)
				const warmMaxAtLat = piecewise(
					WARM_EFFECT_XS,
					WARM_EFFECT_YS,
					distFromTEQ,
				)
				const coldMaxAtLat = piecewise(
					WARM_EFFECT_XS,
					COLD_EFFECT_YS,
					distFromTEQ,
				)
				let maxEffect = w > 0 ? warmMaxAtLat : coldMaxAtLat
				if (isLand[r]) maxEffect *= 0.6
				const delta = w * maxEffect
				temperatureDeltaMonthly[m * N + r] = delta
				climate.temperature_monthly[m * N + r] += delta
				annualDelta += delta
			}
			annualDelta /= CURRENT_EFFECT_MONTHS
			currents.temperatureDelta[r] = annualDelta
			climate.temperature_avg[r] += annualDelta
			climate.temperature_min[r] += annualDelta
			climate.temperature_max[r] += annualDelta
		}
		return
	}

	for (let r = 0; r < N; r++) {
		const w = isLand[r] ? currents.coastalWarmth[r] : currents.oceanWarmth[r]
		if (Math.abs(w) < 0.01) continue

		const distFromTEQ = Math.abs(latDeg[r] - teqAt(r))
		const warmMaxAtLat = piecewise(WARM_EFFECT_XS, WARM_EFFECT_YS, distFromTEQ)
		const coldMaxAtLat = piecewise(WARM_EFFECT_XS, COLD_EFFECT_YS, distFromTEQ)
		let maxEffect = w > 0 ? warmMaxAtLat : coldMaxAtLat
		if (isLand[r]) maxEffect *= 0.6
		const delta = w * maxEffect

		currents.temperatureDelta[r] = delta
		climate.temperature_avg[r] += delta
		climate.temperature_min[r] += delta
		climate.temperature_max[r] += delta
		for (let m = 0; m < CURRENT_EFFECT_MONTHS; m++) {
			temperatureDeltaMonthly[m * N + r] = delta
			climate.temperature_monthly[m * N + r] += delta
		}
	}
}

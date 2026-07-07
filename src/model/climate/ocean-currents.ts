/**
 * Ocean current warmth model.
 *
 * Seeds warm/cold coastal ocean cells from continental coastline geometry plus
 * TEQ-relative latitude bands, then propagates that signal offshore and onto
 * nearby continental land.
 */

import type { GenesisClimate, GenesisParams, SphereMesh } from ".."
import { isRetrogradeObliquity, meanEdgeLengthKm } from "../shared/units"
import type { GenesisLandmarks } from "../terrain/landmarks"
import {
	applyLockedCurrentTemperatureEffect,
	computeLockedOceanCurrents,
} from "./locked/ocean-currents"
import { computeCoastalWarmthFromOceanWarmth } from "./ocean-currents-shared"
import { computeThermalEquator, getClimateGeometry, hadleyWidth } from "./rain"
import type { FlowGrid } from "./wind"
import { rasterizeVectorGrid } from "./wind"

const DEG2RAD = Math.PI / 180
const TYPE_CONTINENT = 0
const TYPE_LAKE = 5
const CURRENT_EFFECT_MONTHS = 12
const TEQ_BINS = 120
const WARM_EFFECT_XS = [0, 20, 40, 50, 60, 80, 90]
const WARM_EFFECT_YS = [1, 2, 8, 12, 15, 10, 0]
const COLD_EFFECT_YS = [1, 2, 6, 8, 10, 5, 0]
const EAST_COAST_WARM_EXTENSION_DEG = 5
const WEST_COAST_COLD_EXTENSION_DEG = 5
const WARM_COASTAL_SEED_DEPTH = 1
const COLD_COASTAL_SEED_DEPTH = 4
const LAND_CURRENT_EFFECT_SCALE = 0.68
const WARM_CURRENT_SEASONALITY = 0.7
const COLD_CURRENT_SEASONALITY = 0.6

interface OceanCurrentResult {
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

const OCEAN_CURRENT_SMOOTHING_PASSES = 2

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

function computeAnnualTeq(
	monthlyTEQ?: Float32Array[],
): Float32Array | undefined {
	if (!monthlyTEQ || monthlyTEQ.length !== CURRENT_EFFECT_MONTHS)
		return undefined
	const annualTeq = new Float32Array(TEQ_BINS)
	for (let bin = 0; bin < TEQ_BINS; bin++) {
		let sum = 0
		for (const teq of monthlyTEQ) sum += teq[bin]
		annualTeq[bin] = sum / CURRENT_EFFECT_MONTHS
	}
	return annualTeq
}

function hasFullMonthlyTeq(
	monthlyTEQ?: Float32Array[],
): monthlyTEQ is Float32Array[] {
	return !!monthlyTEQ && monthlyTEQ.length === CURRENT_EFFECT_MONTHS
}

function computeSeasonalCurrentFactor(
	monthlyTemp: number,
	minMonthlyTemp: number,
	maxMonthlyTemp: number,
	isWarmCurrent: boolean,
): number {
	const range = maxMonthlyTemp - minMonthlyTemp
	const hotPhase = range <= 1e-6 ? 0.5 : (monthlyTemp - minMonthlyTemp) / range
	return isWarmCurrent
		? 1 - WARM_CURRENT_SEASONALITY * hotPhase
		: 1 - COLD_CURRENT_SEASONALITY * (1 - hotPhase)
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
	reverseCirculation: boolean,
	hoursPerDay = 24,
): number {
	if (distFromReference < 5) return 0
	if (distFromReference >= 70) return -1
	const hw = hadleyWidth(hoursPerDay)
	const effectiveEastFacing = reverseCirculation ? !eastFacing : eastFacing
	const effectiveDist = effectiveEastFacing
		? Math.max(0, distFromReference - EAST_COAST_WARM_EXTENSION_DEG)
		: Math.max(0, distFromReference - WEST_COAST_COLD_EXTENSION_DEG)
	const cellIndex = Math.floor(effectiveDist / hw)
	// Even-indexed cells: east-facing coast = warm (western boundary current).
	// Odd-indexed cells: east-facing coast = cold (eastern boundary upwelling).
	const sign = cellIndex % 2 === 0 ? 1 : -1
	return sign * (effectiveEastFacing ? 1 : -1)
}

function seedCoastalNeighbors(
	seeds: Float32Array,
	oceanNeighbors: number[],
	mesh: SphereMesh,
	isLand: Uint8Array,
	isLake: Uint8Array,
	extraDepth: number,
): void {
	const { adjOffset, adjList } = mesh
	const visited = new Uint8Array(mesh.numRegions)
	const queue = new Int32Array(mesh.numRegions)
	const depth = new Int32Array(mesh.numRegions)
	let head = 0
	let tail = 0

	for (const nb of oceanNeighbors) {
		if (isLand[nb] || isLake[nb] || visited[nb]) continue
		visited[nb] = 1
		seeds[nb] = 1
		queue[tail] = nb
		depth[tail] = 0
		tail++
	}

	while (head < tail) {
		const current = queue[head]
		const currentDepth = depth[head]
		head++
		if (currentDepth >= extraDepth) continue
		for (
			let j = adjOffset[current], jEnd = adjOffset[current + 1];
			j < jEnd;
			j++
		) {
			const nb = adjList[j]
			if (isLand[nb] || isLake[nb] || visited[nb]) continue
			visited[nb] = 1
			seeds[nb] = 1
			queue[tail] = nb
			depth[tail] = currentDepth + 1
			tail++
		}
	}
}

function fillOceanBeltSeeds(
	warmSeed: Float32Array,
	coldSeed: Float32Array,
	isLand: Uint8Array,
	isLake: Uint8Array,
	latDeg: Float32Array,
	lonBinByRegion: Int32Array,
	teqByLon?: Float32Array,
	hoursPerDay = 24,
): void {
	const N = latDeg.length
	// Warm equatorial belt narrows on fast rotators and widens on slow ones,
	// tracking the Hadley cell half-width (30° at Earth, 18° at 6h day).
	const warmBeltDeg = hadleyWidth(hoursPerDay) / 3
	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r]) continue
		const distFromReference = teqByLon
			? Math.abs(latDeg[r] - teqByLon[lonBinByRegion[r]])
			: Math.abs(latDeg[r])
		if (distFromReference <= warmBeltDeg) warmSeed[r] = 1
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
	regionBin: Int32Array,
	distCoast: Float32Array,
	avgEdgeKm: number,
): CoastSite[] {
	const { adjOffset, adjList } = mesh
	const openScanSteps = Math.max(1, Math.round(4000 / avgEdgeKm))
	const openOceanCoastKm = 300
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
			lonBin: regionBin[r],
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
		if (warmSeed[r] > coldSeed[r]) {
			oceanWarmth[r] = 1
			continue
		}
		if (coldSeed[r] > warmSeed[r]) {
			oceanWarmth[r] = -1
			continue
		}
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
	distCoast: Float32Array,
	landmarks: GenesisLandmarks,
	params?: Pick<
		Partial<GenesisParams>,
		| "substellarLon"
		| "eccentricity"
		| "obliquity"
		| "perihelion"
		| "planetRadiusKm"
		| "tideLock"
		| "hoursPerDay"
	>,
	monthlyTEQ?: Float32Array[],
): OceanCurrentResult {
	if (params?.tideLock?.type === "solar") {
		return computeLockedOceanCurrents(
			mesh,
			isLand,
			distCoast,
			landmarks,
			params,
		)
	}
	const N = mesh.numRegions
	const avgEdgeKm = meanEdgeLengthKm(mesh, params?.planetRadiusKm)
	const { latDeg, lonDeg, regionBin } = getClimateGeometry(mesh)
	const reverseCirculation = isRetrogradeObliquity(params?.obliquity ?? 0)
	const hoursPerDay = params?.hoursPerDay ?? 24
	// Coriolis scales with rotation rate; below ~96h days the gyre-based east/west
	// coast seeding fades out and belt seeds (warm tropics, cold poles) dominate.
	const coriolisWeight = Math.min(1, Math.sqrt(24 / hoursPerDay))

	const annualTeq = computeAnnualTeq(monthlyTEQ)
	const hasMonthlyTeq = hasFullMonthlyTeq(monthlyTEQ)

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
		regionBin,
		distCoast,
		avgEdgeKm,
	)

	const oceanWarmthMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
	const coastalWarmthMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
	const oceanWarmth = new Float32Array(N)
	const coastalWarmth = new Float32Array(N)

	for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
		const teqByLon = hasMonthlyTeq ? monthlyTEQ[month] : annualTeq
		const warmSeed = new Float32Array(N)
		const coldSeed = new Float32Array(N)

		fillOceanBeltSeeds(
			warmSeed,
			coldSeed,
			isLand,
			isLake,
			latDeg,
			regionBin,
			teqByLon,
			hoursPerDay,
		)
		for (const site of coastSites) {
			const distFromReference = teqByLon
				? Math.abs(latDeg[site.region] - teqByLon[site.lonBin])
				: Math.abs(latDeg[site.region])
			const warmth = classifyCurrentWarmth(
				distFromReference,
				site.eastFacing,
				reverseCirculation,
				hoursPerDay,
			)
			if (warmth * coriolisWeight > 0.5) {
				seedCoastalNeighbors(
					warmSeed,
					site.oceanNeighbors,
					mesh,
					isLand,
					isLake,
					WARM_COASTAL_SEED_DEPTH,
				)
			} else if (warmth * coriolisWeight < -0.5) {
				seedCoastalNeighbors(
					coldSeed,
					site.oceanNeighbors,
					mesh,
					isLand,
					isLake,
					COLD_COASTAL_SEED_DEPTH,
				)
			}
		}

		const monthOceanWarmth = computeOceanWarmthFromSeeds(
			mesh,
			isLand,
			isLake,
			warmSeed,
			coldSeed,
		)
		const monthCoastalWarmth = computeCoastalWarmthFromOceanWarmth(
			mesh,
			isLand,
			isLake,
			monthOceanWarmth,
			avgEdgeKm,
		)
		oceanWarmthMonthly.set(monthOceanWarmth, month * N)
		coastalWarmthMonthly.set(monthCoastalWarmth, month * N)
		for (let r = 0; r < N; r++) {
			oceanWarmth[r] += monthOceanWarmth[r] / CURRENT_EFFECT_MONTHS
			coastalWarmth[r] += monthCoastalWarmth[r] / CURRENT_EFFECT_MONTHS
		}
	}

	return {
		oceanWarmth,
		coastalWarmth,
		oceanWarmthMonthly,
		coastalWarmthMonthly,
		temperatureDeltaMonthly: new Float32Array(N * CURRENT_EFFECT_MONTHS),
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
	climate: GenesisClimate,
	isLand: Uint8Array,
	currents: OceanCurrentResult,
	monthlyTEQ?: Float32Array[],
	params?: Pick<
		GenesisParams,
		"substellarLon" | "eccentricity" | "obliquity" | "perihelion" | "tideLock"
	>,
): void {
	if (params?.tideLock?.type === "solar") {
		applyLockedCurrentTemperatureEffect(mesh, climate, isLand, currents, params)
		return
	}
	const N = mesh.numRegions
	const { latDeg, regionBin } = getClimateGeometry(mesh)
	const teqByBin =
		computeAnnualTeq(monthlyTEQ) ??
		computeThermalEquator(mesh, climate.temperature_avg, TEQ_BINS)
	const temperatureDeltaMonthly =
		currents.temperatureDeltaMonthly ??
		(currents.temperatureDeltaMonthly = new Float32Array(
			N * CURRENT_EFFECT_MONTHS,
		))
	currents.temperatureDelta.fill(0)
	temperatureDeltaMonthly.fill(0)
	const hasMonthlyWarmth =
		!!currents.oceanWarmthMonthly && !!currents.coastalWarmthMonthly
	const hasMonthlyClimateTeq = hasFullMonthlyTeq(monthlyTEQ)

	function teqAt(r: number): number {
		const bin = regionBin[r]
		return teqByBin[bin]
	}

	for (let r = 0; r < N; r++) {
		let minMonthlyTemp = climate.temperature_monthly[r]
		let maxMonthlyTemp = climate.temperature_monthly[r]
		for (let m = 1; m < CURRENT_EFFECT_MONTHS; m++) {
			const monthlyTemp = climate.temperature_monthly[m * N + r]
			if (monthlyTemp < minMonthlyTemp) minMonthlyTemp = monthlyTemp
			if (monthlyTemp > maxMonthlyTemp) maxMonthlyTemp = monthlyTemp
		}
		let annualDelta = 0
		let minDelta = 0
		let maxDelta = 0
		for (let m = 0; m < CURRENT_EFFECT_MONTHS; m++) {
			const w = hasMonthlyWarmth
				? isLand[r]
					? currents.coastalWarmthMonthly![m * N + r]
					: currents.oceanWarmthMonthly![m * N + r]
				: isLand[r]
					? currents.coastalWarmth[r]
					: currents.oceanWarmth[r]
			if (Math.abs(w) < 0.01) continue
			const monthTeq = hasMonthlyClimateTeq
				? monthlyTEQ[m][regionBin[r]]
				: teqAt(r)
			const distFromTEQ = Math.abs(latDeg[r] - monthTeq)
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
			if (isLand[r]) maxEffect *= LAND_CURRENT_EFFECT_SCALE
			const seasonalFactor = computeSeasonalCurrentFactor(
				climate.temperature_monthly[m * N + r],
				minMonthlyTemp,
				maxMonthlyTemp,
				w > 0,
			)
			const delta = w * maxEffect * seasonalFactor
			temperatureDeltaMonthly[m * N + r] = delta
			climate.temperature_monthly[m * N + r] += delta
			annualDelta += delta
			if (delta < minDelta) minDelta = delta
			if (delta > maxDelta) maxDelta = delta
		}
		annualDelta /= CURRENT_EFFECT_MONTHS
		currents.temperatureDelta[r] = annualDelta
		climate.temperature_avg[r] += annualDelta
		climate.temperature_min[r] += minDelta
		climate.temperature_max[r] += maxDelta
	}
}

export function buildOceanCurrentGrid(
	mesh: SphereMesh,
	oceanWarmth: Float32Array,
	isLand: Uint8Array,
	latDeg: Float32Array,
	lonDeg: Float32Array,
	reverseCirculation = false,
	_teqByLon?: Float32Array,
	_regionBin?: Int32Array,
	_hoursPerDay = 24,
	planetRadiusKm?: number,
): FlowGrid {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const gradX = new Float32Array(N)
	const gradY = new Float32Array(N)
	const smoothedX = new Float32Array(N)
	const smoothedY = new Float32Array(N)
	const currentU = new Float32Array(N)
	const currentV = new Float32Array(N)
	const currentSpeed = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		let gx = 0
		let gy = 0
		let weightSum = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			const dx =
				wrapLonDeltaDeg(lonDeg[nb] - lonDeg[r]) *
				Math.cos((((latDeg[r] + latDeg[nb]) * 0.5) / 180) * Math.PI)
			const dy = latDeg[nb] - latDeg[r]
			const distSq = dx * dx + dy * dy
			if (distSq <= 1e-6) continue
			const neighbourWarmth = isLand[nb] ? 0 : oceanWarmth[nb]
			const dw = neighbourWarmth - oceanWarmth[r]
			gx += (dw * dx) / distSq
			gy += (dw * dy) / distSq
			weightSum += 1
		}
		if (weightSum > 0) {
			gradX[r] = gx / weightSum
			gradY[r] = gy / weightSum
		}
	}

	let srcX = gradX
	let srcY = gradY
	let dstX = smoothedX
	let dstY = smoothedY
	for (let pass = 0; pass < OCEAN_CURRENT_SMOOTHING_PASSES; pass++) {
		for (let r = 0; r < N; r++) {
			if (isLand[r]) {
				dstX[r] = 0
				dstY[r] = 0
				continue
			}
			let sumX = srcX[r]
			let sumY = srcY[r]
			let count = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (isLand[nb]) continue
				sumX += srcX[nb]
				sumY += srcY[nb]
				count++
			}
			dstX[r] = sumX / count
			dstY[r] = sumY / count
		}
		;[srcX, dstX] = [dstX, srcX]
		;[srcY, dstY] = [dstY, srcY]
	}

	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		const hemisphereTurn =
			(latDeg[r] >= 0 ? 1 : -1) * (reverseCirculation ? -1 : 1)
		const u = srcY[r] * hemisphereTurn
		const v = -srcX[r] * hemisphereTurn
		const speed = Math.hypot(u, v)
		currentU[r] = u
		currentV[r] = v
		currentSpeed[r] = speed
	}

	// BFS from land to find ocean cells within the coastal display band.
	const maxCoastHops = Math.round(600 / meanEdgeLengthKm(mesh, planetRadiusKm))
	const coastalOcean = new Uint8Array(N)
	const bfsQueue = new Int32Array(N)
	const bfsDist = new Int32Array(N).fill(-1)
	let head = 0
	let tail = 0
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && bfsDist[nb] < 0) {
				bfsDist[nb] = 0
				coastalOcean[nb] = 1
				bfsQueue[tail++] = nb
			}
		}
	}
	while (head < tail) {
		const r = bfsQueue[head++]
		if (bfsDist[r] >= maxCoastHops) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && bfsDist[nb] < 0) {
				bfsDist[nb] = bfsDist[r] + 1
				coastalOcean[nb] = 1
				bfsQueue[tail++] = nb
			}
		}
	}

	return rasterizeVectorGrid(mesh, currentU, currentV, currentSpeed, {
		scalar: oceanWarmth,
		allowCell: (region) => !isLand[region] && coastalOcean[region] === 1,
		isBlockedRegion: (region) => !!isLand[region],
	})
}

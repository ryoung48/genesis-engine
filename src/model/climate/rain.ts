/**
 * Rainfall model for the genesis pipeline.
 * Computes moisture advection and monthly rainfall using typed-array-based
 * SphereMesh and GenesisClimate data (no Cell/window.world dependencies).
 */
import { PriorityQueue } from "@datastructures-js/priority-queue"
import type { GenesisClimate, GenesisParams, SphereMesh } from ".."
import {
	clamp,
	getRegionLatLonDegrees,
	piecewise,
	smoothstep,
} from "../shared/math"
import { SimplexNoise } from "../shared/simplex-noise"
import { isRetrogradeObliquity, meanEdgeLengthKm } from "../shared/units"
import {
	type GenesisLandmarks,
	LANDMARK_TYPE_OCEAN,
} from "../terrain/landmarks"
import { elevToHeightKm } from "./climate"
import { computeTidalRain } from "./locked/rain"

const DEG2RAD = Math.PI / 180
const EAST_MOISTURE_WIN_BIAS = 1.03

export const ceilingScale = (x: number) =>
	piecewise(
		[-14, -8, 2, 12, 18, 40, 60, 90],
		[40, 62, 83, 125, 165, 300, 150, 0],
		x,
	)

export function getPressureRainFactor(pressure: number | undefined): number {
	// Lower pressure -> easier evaporation -> more rain; higher -> suppressed.
	// ~1/p^0.4: 0.1bar->2.5x, 0.25->1.6x, 0.5->1.3x, 1->1x, 2->0.76x, 4->0.57x, 10->0.40x
	return Math.pow(1 / (pressure ?? 1.0), 0.4)
}

const itczScale = (x: number) =>
	piecewise([0, 0.26, 0.6, 0.93], [1, 0.7, 0.2, 0], x)
const subsidenceScale = (x: number) =>
	piecewise([0.5, 0.66, 0.83, 1, 1.16, 1.33], [0, 0.5, 1, 1, 0.5, 0], x)
const eastStormScale = (x: number) => piecewise([0.33, 1.16, 3], [0, 0.8, 1], x)
const westerliesScale = (x: number) =>
	piecewise([1.33, 1.66, 3], [0, 1, 0.8], x)

export const hadleyWidth = (x: number) =>
	piecewise([6, 12, 24, 48, 96, 192, 384], [18, 25, 30, 40, 55, 65, 70], x)

interface ClimateGeometry {
	latDeg: Float32Array
	lonDeg: Float32Array
	absLatDeg: Float32Array
	sinLat: Float32Array
	cosLat: Float32Array
	lonRad: Float32Array
	regionBin: Int32Array
	edgeEastward: Float32Array
	edgeNorthward: Float32Array
}

const climateGeometryCache = new WeakMap<SphereMesh, ClimateGeometry>()

export function getClimateGeometry(mesh: SphereMesh): ClimateGeometry {
	const cached = climateGeometryCache.get(mesh)
	if (cached) return cached

	const { latDeg, lonDeg } = getRegionLatLonDegrees(mesh)
	const N = mesh.numRegions
	const absLatDeg = new Float32Array(N)
	const sinLat = new Float32Array(N)
	const cosLat = new Float32Array(N)
	const lonRad = new Float32Array(N)
	const lonBinWidth = 360 / TEQ_NUM_BINS
	const regionBin = new Int32Array(N)

	for (let r = 0; r < N; r++) {
		const latRad = latDeg[r] * DEG2RAD
		absLatDeg[r] = Math.abs(latDeg[r])
		sinLat[r] = Math.sin(latRad)
		cosLat[r] = Math.cos(latRad)
		lonRad[r] = lonDeg[r] * DEG2RAD
		regionBin[r] = Math.max(
			0,
			Math.min(TEQ_NUM_BINS - 1, Math.floor((lonDeg[r] + 180) / lonBinWidth)),
		)
	}

	const edgeEastward = new Float32Array(mesh.adjList.length)
	const edgeNorthward = new Float32Array(mesh.adjList.length)
	for (let r = 0; r < N; r++) {
		const sinLat1 = sinLat[r]
		const cosLat1 = cosLat[r]
		const lon1 = lonRad[r]
		for (
			let j = mesh.adjOffset[r], jEnd = mesh.adjOffset[r + 1];
			j < jEnd;
			j++
		) {
			const nb = mesh.adjList[j]
			const dLon = lonRad[nb] - lon1
			const y = Math.sin(dLon) * cosLat[nb]
			const x = cosLat1 * sinLat[nb] - sinLat1 * cosLat[nb] * Math.cos(dLon)
			const norm = Math.hypot(y, x)
			if (norm > 1e-9) {
				edgeEastward[j] = y / norm
				edgeNorthward[j] = x / norm
			} else {
				edgeEastward[j] = 0
				edgeNorthward[j] = 1
			}
		}
	}

	const geometry = {
		latDeg,
		lonDeg,
		absLatDeg,
		sinLat,
		cosLat,
		lonRad,
		regionBin,
		edgeEastward,
		edgeNorthward,
	}
	climateGeometryCache.set(mesh, geometry)
	return geometry
}

export function buildRegionGraph(mesh: SphereMesh, mask: Uint8Array) {
	const { adjOffset, adjList } = mesh
	const landRegions: number[] = []
	for (let r = 0; r < mesh.numRegions; r++) {
		if (mask[r]) landRegions.push(r)
	}

	const landNeighborOffset = new Int32Array(landRegions.length + 1)
	let landNeighborCount = 0
	for (let i = 0; i < landRegions.length; i++) {
		const r = landRegions[i]
		landNeighborOffset[i] = landNeighborCount
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			if (mask[adjList[j]]) landNeighborCount++
		}
	}
	landNeighborOffset[landRegions.length] = landNeighborCount

	const landNeighborList = new Int32Array(landNeighborCount)
	let landNeighborIndex = 0
	for (let i = 0; i < landRegions.length; i++) {
		const r = landRegions[i]
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (mask[nb]) landNeighborList[landNeighborIndex++] = nb
		}
	}

	return { landRegions, landNeighborOffset, landNeighborList }
}

function buildRainRegionMask(
	isLand: Uint8Array,
	landmarks?: Pick<GenesisLandmarks, "regionLandmark" | "type">,
): Uint8Array {
	const rainMask = new Uint8Array(isLand)
	if (!landmarks) return rainMask

	for (let r = 0; r < isLand.length; r++) {
		if (rainMask[r]) continue
		const landmarkId = landmarks.regionLandmark[r]
		if (landmarkId >= 0 && landmarks.type[landmarkId] !== LANDMARK_TYPE_OCEAN) {
			rainMask[r] = 1
		}
	}

	return rainMask
}

// ---------------------------------------------------------------------------
// Thermal equator computation (extracted from GenesisView.tsx)
// ---------------------------------------------------------------------------

const TEQ_NUM_BINS = 120 // 3 deg per bin
const TEQ_HALF_WIN = 10 // circular smoothing window

function computeTEQBins(
	mesh: SphereMesh,
	temps: Float32Array,
	numBins: number,
): { binMaxTemp: Float32Array; smoothLat: Float32Array } {
	const N = mesh.numRegions
	const { latDeg, lonDeg, regionBin } = getClimateGeometry(mesh)
	const binMaxTemp = new Float32Array(numBins).fill(-Infinity)
	const binMaxLat = new Float32Array(numBins)
	const useCachedBins = numBins === TEQ_NUM_BINS

	for (let r = 0; r < N; r++) {
		const bin = useCachedBins
			? regionBin[r]
			: Math.max(
					0,
					Math.min(
						numBins - 1,
						Math.floor(((lonDeg[r] + 180) / 360) * numBins),
					),
				)
		if (temps[r] > binMaxTemp[bin]) {
			binMaxTemp[bin] = temps[r]
			binMaxLat[bin] = latDeg[r]
		}
	}

	const smoothLat = new Float32Array(numBins)
	for (let i = 0; i < numBins; i++) {
		let sum = 0
		let count = 0
		for (let d = -TEQ_HALF_WIN; d <= TEQ_HALF_WIN; d++) {
			const j = (((i + d) % numBins) + numBins) % numBins
			if (binMaxTemp[j] !== -Infinity) {
				sum += binMaxLat[j]
				count++
			}
		}
		smoothLat[i] = count > 0 ? sum / count : 0
	}

	return { binMaxTemp, smoothLat }
}

/**
 * Compute per-longitude-bin thermal equator latitude for a given temperature field.
 * Returns a Float32Array of length NUM_BINS with the smoothed TEQ latitude per bin.
 */
export function computeThermalEquator(
	mesh: SphereMesh,
	temps: Float32Array,
	numBins: number = TEQ_NUM_BINS,
): Float32Array {
	return computeTEQBins(mesh, temps, numBins).smoothLat
}

/**
 * Get thermal equator line as [lon, lat] points (for rendering).
 * Returns null if insufficient data.
 */
export function computeThermalEquatorLine(
	mesh: SphereMesh,
	temps: Float32Array,
	numBins: number = TEQ_NUM_BINS,
): [number, number][] | null {
	const { binMaxTemp, smoothLat } = computeTEQBins(mesh, temps, numBins)
	const points: [number, number][] = []
	for (let i = 0; i < numBins; i++) {
		if (binMaxTemp[i] === -Infinity) continue
		const lonDeg = -180 + (i + 0.5) * (360 / numBins)
		points.push([lonDeg, smoothLat[i]])
	}
	if (points.length > 0) points.push([points[0][0] + 360, points[0][1]])
	return points.length > 2 ? points : null
}

// ---------------------------------------------------------------------------
// Moisture advection
// ---------------------------------------------------------------------------

/**
 * Compute east/west moisture advection fields.
 * Best-first propagation from weighted ocean sources with latitude-band steering.
 */
export function computeAdvection(
	mesh: SphereMesh,
	elevation: Float32Array,
	distCoast: Float32Array,
	climate: GenesisClimate | undefined,
	params: number | Pick<GenesisParams, "planetRadiusKm"> | undefined,
	isLand: Uint8Array,
	elevation_km?: Float32Array,
): {
	east: Float32Array
	west: Float32Array
} {
	const N = mesh.numRegions
	const wet = 30

	const planetRadiusKm =
		typeof params === "number" ? params : params?.planetRadiusKm
	const avgEdgeKm = meanEdgeLengthKm(mesh, planetRadiusKm)
	const scale = 94.5 / avgEdgeKm
	const deepOceanThreshold = 1260 / avgEdgeKm

	const { latDeg, absLatDeg, regionBin, edgeEastward, edgeNorthward } =
		getClimateGeometry(mesh)

	const { adjOffset, adjList } = mesh
	const land = isLand

	const computePair = (teqByLon: Float32Array) => {
		const basinLabel = new Int32Array(N).fill(-1)
		let basinCount = 0
		for (let r = 0; r < N; r++) {
			if (land[r] || elevation[r] > 0 || basinLabel[r] >= 0) continue
			const basin = basinCount++
			const stack = [r]
			basinLabel[r] = basin
			while (stack.length > 0) {
				const current = stack.pop()!
				for (
					let j = adjOffset[current], jEnd = adjOffset[current + 1];
					j < jEnd;
					j++
				) {
					const nb = adjList[j]
					if (land[nb] || elevation[nb] > 0 || basinLabel[nb] >= 0) continue
					basinLabel[nb] = basin
					stack.push(nb)
				}
			}
		}
		const minBasinSize = Math.max(1, Math.floor(N * 0.005))
		const basinSize = new Int32Array(basinCount)
		for (let r = 0; r < N; r++) {
			if (basinLabel[r] >= 0) basinSize[basinLabel[r]]++
		}

		const sourceMoisture = new Float32Array(N)
		for (let r = 0; r < N; r++) {
			if (
				!land[r] &&
				elevation[r] <= 0 &&
				basinLabel[r] >= 0 &&
				basinSize[basinLabel[r]] >= minBasinSize
			) {
				sourceMoisture[r] =
					wet * smoothstep(0, deepOceanThreshold, distCoast[r])
			}
		}

		const east = new Float32Array(N)
		const west = new Float32Array(N)
		const isValidFlow = (
			attr: "east" | "west",
			r: number,
			eastward: number,
			northward: number,
		): boolean => {
			const lat = latDeg[r]
			const absLat = absLatDeg[r]
			const teq = teqByLon[regionBin[r]]
			const distToTeq = Math.abs(lat - teq)

			if (attr === "east") {
				const zonalStrength = piecewise(
					[0, 10, 25, 35, 50],
					[0.7, 1, 1, 0.4, 0],
					absLat,
				)
				const meridionalStrength = piecewise(
					[0, 5, 15, 30, 40],
					[0, 0.2, 0.55, 0.8, 0],
					distToTeq,
				)
				const teqDir = teq > lat ? 1 : teq < lat ? -1 : 0
				const flowEast = -zonalStrength
				const flowNorth = teqDir * meridionalStrength
				const flowNorm = Math.hypot(flowEast, flowNorth)
				if (flowNorm < 1e-6) return eastward <= -0.573576436351046
				const alignment =
					(eastward * flowEast + northward * flowNorth) / flowNorm
				return alignment >= 0.35
			}
			const subtropicalJet = piecewise(
				[20, 28, 32, 40],
				[0, 0.75, 1.1, 0.3],
				absLat,
			)
			const polarJet = piecewise([45, 52, 60, 70], [0, 0.45, 0.9, 0], absLat)
			const zonalStrength = Math.max(0.7, subtropicalJet, polarJet)
			const polewardStrength = piecewise(
				[22, 30, 45, 60, 75],
				[0, 0.2, 0.55, 0.35, 0],
				absLat,
			)
			const poleDir = lat >= teq ? 1 : -1
			const flowEast = zonalStrength
			const flowNorth = poleDir * polewardStrength
			const flowNorm = Math.hypot(flowEast, flowNorth)
			const alignment = (eastward * flowEast + northward * flowNorth) / flowNorm
			return alignment >= 0.4
		}

		const assignRain = (attr: "east" | "west") => {
			const moisture = attr === "east" ? east : west
			const settled = new Uint8Array(N)
			const queue = new PriorityQueue<{ region: number; moisture: number }>(
				(a, b) => b.moisture - a.moisture,
			)

			for (let r = 0; r < N; r++) {
				if (!land[r] && sourceMoisture[r] > 1e-3) {
					moisture[r] = sourceMoisture[r]
					queue.enqueue({ region: r, moisture: sourceMoisture[r] })
				}
			}

			while (!queue.isEmpty()) {
				const next = queue.dequeue()
				if (!next) break
				const r = next.region
				if (settled[r]) continue
				if (next.moisture + 1e-3 < moisture[r]) continue
				settled[r] = 1
				const heightKm = elevation_km
					? elevation_km[r]
					: elevToHeightKm(elevation[r])
				const orographic = heightKm > 2 ? -1.8 : -0.6
				const impact = (!land[r] ? 0.5 : orographic) / scale
				const m = Math.max(Math.min(Math.max(moisture[r], 0) + impact, wet), 0)

				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					if (!isValidFlow(attr, r, edgeEastward[j], edgeNorthward[j])) continue
					if (!settled[nb] && m > moisture[nb] + 1e-3) {
						moisture[nb] = m
						queue.enqueue({ region: nb, moisture: m })
					}
				}
			}

			const smoothed = new Float32Array(N)
			for (let r = 0; r < N; r++) {
				if (!land[r]) {
					smoothed[r] = moisture[r]
					continue
				}
				let sum = moisture[r]
				let count = 1
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					if (land[nb]) {
						sum += moisture[nb]
						count++
					}
				}
				smoothed[r] = sum / count
			}
			for (let r = 0; r < N; r++) moisture[r] = smoothed[r]
		}

		assignRain("east")
		assignRain("west")

		for (let r = 0; r < N; r++) {
			east[r] /= wet
			west[r] /= wet
			if (east[r] * EAST_MOISTURE_WIN_BIAS > west[r]) west[r] = 0
			else east[r] = 0
		}

		return { east, west }
	}

	const annualTeq = climate
		? computeThermalEquator(mesh, climate.temperature_avg)
		: new Float32Array(TEQ_NUM_BINS)
	const annual = computePair(annualTeq)

	return annual
}

// ---------------------------------------------------------------------------
// Monthly rainfall
// ---------------------------------------------------------------------------

/**
 * Compute 0-1 rainfall weight from zone drivers.
 */
function computeWeight(
	cellLat: number,
	teq: number,
	eastMoisture: number,
	westMoisture: number,
	daysPerYear: number,
	bandOffsetDeg: number = 0,
): number {
	const hadley = hadleyWidth(daysPerYear)
	const dist = Math.abs(cellLat - (teq + bandOffsetDeg)) / hadley
	const moisture = Math.max(eastMoisture, westMoisture)
	const itcz = itczScale(dist) * moisture
	const suppression = 1 - clamp(subsidenceScale(dist), 0, 1)
	const eastStorms = eastStormScale(dist) * eastMoisture
	const westerlies = westerliesScale(dist) * westMoisture
	return clamp(Math.max(itcz * suppression, eastStorms, westerlies), 0, 1)
}

export function computeRainBandWarpField(
	mesh: SphereMesh,
	seed: number,
	amplitudeDeg: number,
	regions?: ArrayLike<number>,
): Float32Array {
	const N = mesh.numRegions
	const warpXNoise = new SimplexNoise(seed + 4011)
	const warpYNoise = new SimplexNoise(seed + 4012)
	const warpZNoise = new SimplexNoise(seed + 4013)
	const bandNoise = new SimplexNoise(seed + 4014)
	const detailNoise = new SimplexNoise(seed + 4015)
	const warp = new Float32Array(N)
	const regionCount = regions?.length ?? N

	for (let i = 0; i < regionCount; i++) {
		const r = regions ? regions[i] : i
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]

		const dx = warpXNoise.fbm(
			x * 1.25 + 17.3,
			y * 1.25 + 9.1,
			z * 1.25 + 23.7,
			3,
			0.55,
		)
		const dy = warpYNoise.fbm(
			x * 1.25 + 31.9,
			y * 1.25 + 14.7,
			z * 1.25 + 5.3,
			3,
			0.55,
		)
		const dz = warpZNoise.fbm(
			x * 1.25 + 7.1,
			y * 1.25 + 28.4,
			z * 1.25 + 12.9,
			3,
			0.55,
		)
		const wx = x + dx * 0.3
		const wy = y + dy * 0.3
		const wz = z + dz * 0.3

		const broad = bandNoise.fbm(wx * 1.8, wy * 1.8, wz * 1.8, 4, 0.55)
		const detail = detailNoise.fbm(
			wx * 5.0 + 43.1,
			wy * 5.0 + 18.7,
			wz * 5.0 + 29.4,
			3,
			0.5,
		)
		warp[r] = (broad * 0.72 + detail * 0.28) * amplitudeDeg
	}

	return warp
}

/**
 * Compute monthly and annual rainfall for all regions.
 */
export function computeMonthlyRain(
	mesh: SphereMesh,
	climate: GenesisClimate,
	eastAdv: Float32Array,
	westAdv: Float32Array,
	isLand: Uint8Array,
	params?: GenesisParams,
	monthlyTEQ?: Float32Array[],
	distCoast?: Float32Array,
	landmarks?: Pick<GenesisLandmarks, "regionLandmark" | "type">,
): { monthly: Float32Array; annual: Float32Array } {
	const rainRegionMask = buildRainRegionMask(isLand, landmarks)
	if (params?.tideLock?.type === "solar") {
		return computeTidalRain(mesh, climate, rainRegionMask, params, distCoast)
	}

	const N = mesh.numRegions
	const reverseCirculation = isRetrogradeObliquity(params?.obliquity ?? 0)
	const pressureRainFactor = getPressureRainFactor(params?.pressure)

	const { latDeg, regionBin } = getClimateGeometry(mesh)
	const { landRegions, landNeighborOffset, landNeighborList } =
		buildRegionGraph(mesh, rainRegionMask)

	const teqPerMonth: Float32Array[] =
		monthlyTEQ ??
		(() => {
			const result: Float32Array[] = new Array(12)
			for (let month = 0; month < 12; month++) {
				result[month] = computeThermalEquator(
					mesh,
					climate.temperature_monthly.subarray(month * N, (month + 1) * N),
				)
			}
			return result
		})()

	const monthly = new Float32Array(N * 12)
	const boundaryWarpDeg = computeRainBandWarpField(
		mesh,
		params?.seed ?? 0,
		5.5,
		landRegions,
	)
	for (const r of landRegions) {
		const e = reverseCirculation ? westAdv[r] : eastAdv[r]
		const w = reverseCirculation ? eastAdv[r] : westAdv[r]
		const bin = regionBin[r]
		for (let month = 0; month < 12; month++) {
			const teq = teqPerMonth[month][bin]
			const weight = computeWeight(
				latDeg[r],
				teq,
				e,
				w,
				params.hoursPerDay,
				boundaryWarpDeg[r],
			)
			const monthTemp = climate.temperature_monthly[month * N + r]
			monthly[month * N + r] =
				weight * ceilingScale(monthTemp) * pressureRainFactor
		}
	}

	// ── Precipitation noise: break up uniform rainfall bands ───────────
	// Two octaves of simplex noise, applied as a multiplicative factor
	// (0.55–1.45) so dry areas stay dry and wet areas get organic variation.
	{
		const seed = params?.seed ?? 0
		const sn1 = new SimplexNoise(seed + 4001)
		const sn2 = new SimplexNoise(seed + 4002)
		const FREQ1 = 3.5
		const FREQ2 = 8.0
		const AMP1 = 0.28
		const AMP2 = 0.12

		for (const r of landRegions) {
			const x = mesh.r_xyz[3 * r]
			const y = mesh.r_xyz[3 * r + 1]
			const z = mesh.r_xyz[3 * r + 2]
			const n =
				sn1.noise3D(x * FREQ1, y * FREQ1, z * FREQ1) * AMP1 +
				sn2.noise3D(x * FREQ2, y * FREQ2, z * FREQ2) * AMP2
			// Multiplicative: clamp factor to [0.55, 1.45]
			const factor = Math.max(0.55, Math.min(1.45, 1 + n))
			for (let month = 0; month < 12; month++) {
				monthly[month * N + r] *= factor
			}
		}
	}

	const smoothBuf = new Float32Array(N)
	for (let pass = 0; pass < 3; pass++) {
		for (let month = 0; month < 12; month++) {
			const offset = month * N
			for (let i = 0; i < landRegions.length; i++) {
				const r = landRegions[i]
				let sum = 0
				const start = landNeighborOffset[i]
				const end = landNeighborOffset[i + 1]
				for (let j = start; j < end; j++) {
					sum += monthly[offset + landNeighborList[j]]
				}
				sum += monthly[offset + r]
				smoothBuf[r] = sum / (end - start + 1)
			}
			for (const r of landRegions) {
				monthly[offset + r] = smoothBuf[r]
			}
		}
	}

	const annual = new Float32Array(N)
	for (const r of landRegions) {
		let sum = 0
		for (let month = 0; month < 12; month++) {
			sum += monthly[month * N + r]
		}
		annual[r] = sum
	}

	return { monthly, annual }
}

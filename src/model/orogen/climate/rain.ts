/**
 * Rainfall model for the orogen pipeline.
 * Computes moisture advection and monthly rainfall using typed-array-based
 * SphereMesh and OrogenClimate data (no Cell/window.world dependencies).
 */
import { PriorityQueue } from "@datastructures-js/priority-queue"
import type { SphereMesh, OrogenClimate, OrogenParams } from "../types"
import { elevToHeightKm } from "./climate"
import { getDaysPerYear, getHoursPerDay, getSubstellarDir, isRetrogradeObliquity, isTidallyLocked, meanEdgeLengthKm } from "../units"
import { SimplexNoise } from "../simplex-noise"

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

// ---------------------------------------------------------------------------
// Piecewise-linear interpolation (replaces d3.scaleLinear, clamped)
// ---------------------------------------------------------------------------

function piecewise(domain: number[], range: number[], x: number): number {
	if (x <= domain[0]) return range[0]
	if (x >= domain[domain.length - 1]) return range[range.length - 1]
	for (let i = 1; i < domain.length; i++) {
		if (x <= domain[i]) {
			const t = (x - domain[i - 1]) / (domain[i] - domain[i - 1])
			return range[i - 1] + t * (range[i] - range[i - 1])
		}
	}
	return range[range.length - 1]
}

function angleDeltaDeg(a: number, b: number): number {
	const d = ((a - b + 540) % 360) - 180
	return Math.abs(d)
}

function clamp(x: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, x))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	if (edge0 === edge1) return x < edge0 ? 0 : 1
	const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
	return t * t * (3 - 2 * t)
}

const ceilingScale = (x: number) => piecewise([-14, -8, 2, 12, 18, 40, 60, 90], [40, 62, 83, 125, 165, 300, 150, 0], x)

const itczScale = (x: number) => piecewise([0, 8, 18, 28], [1, 0.7, 0.2, 0], x)
const subsidenceScale = (x: number) => piecewise([15, 20, 25, 30, 35, 40], [0, 0.5, 1, 1, 0.5, 0], x)
const eastStormScale = (x: number) => piecewise([15, 35, 90], [0, 0.8, 1], x)
const westerliesScale = (x: number) => piecewise([40, 50, 90], [0, 1, 0.8], x)

type CirculationControls = {
	hadleyWidth: number
	hadleyWetStrength: number
	hadleyDryStrength: number
}

function getCirculationControls(
	params?: Pick<OrogenParams, "daysPerYear" | "hoursPerDay" | "tidallyLocked">,
): CirculationControls {
	// Tidally locked: no rotation-driven Coriolis, so the Hadley cell spans
	// much wider and convection concentrates near the substellar point.
	if (isTidallyLocked(params?.tidallyLocked)) {
		return {
			hadleyWidth: 1.8,
			hadleyWetStrength: 1.6,
			hadleyDryStrength: 0.5,
		}
	}

	const hoursPerDay = getHoursPerDay(params?.hoursPerDay)
	const daysPerYear = getDaysPerYear(params?.daysPerYear)
	const seasonalStrength = Math.pow(daysPerYear / 365, 0.25)
	const rotationWidth = Math.pow(hoursPerDay / 24, 0.35)

	return {
		hadleyWidth: clamp(rotationWidth, 0.65, 1.9),
		hadleyWetStrength: clamp(seasonalStrength, 0.7, 1.8),
		hadleyDryStrength: clamp(Math.pow(daysPerYear / 365, 0.3), 0.7, 1.9),
	}
}

// ---------------------------------------------------------------------------
// Thermal equator computation (extracted from OrogenView.tsx)
// ---------------------------------------------------------------------------

const TEQ_NUM_BINS = 120 // 3 deg per bin
const TEQ_HALF_WIN = 10   // circular smoothing window

/**
 * Compute per-longitude-bin thermal equator latitude for a given temperature field.
 * Returns a Float32Array of length NUM_BINS with the smoothed TEQ latitude per bin.
 */
export function computeThermalEquator(
	mesh: SphereMesh,
	temps: Float32Array,
	numBins: number = TEQ_NUM_BINS,
): Float32Array {
	const N = mesh.numRegions
	const binMaxTemp = new Float32Array(numBins).fill(-Infinity)
	const binMaxLat = new Float32Array(numBins)

	for (let r = 0; r < N; r++) {
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]
		const lonDeg = Math.atan2(y, x) * RAD2DEG
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * RAD2DEG
		const bin = Math.max(0, Math.min(numBins - 1,
			Math.floor((lonDeg + 180) / 360 * numBins)))
		if (temps[r] > binMaxTemp[bin]) {
			binMaxTemp[bin] = temps[r]
			binMaxLat[bin] = latDeg
		}
	}

	const smoothLat = new Float32Array(numBins)
	for (let i = 0; i < numBins; i++) {
		let sum = 0
		let count = 0
		for (let d = -TEQ_HALF_WIN; d <= TEQ_HALF_WIN; d++) {
			const j = ((i + d) % numBins + numBins) % numBins
			if (binMaxTemp[j] !== -Infinity) {
				sum += binMaxLat[j]
				count++
			}
		}
		smoothLat[i] = count > 0 ? sum / count : 0
	}

	return smoothLat
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
	const N = mesh.numRegions
	const binMaxTemp = new Float32Array(numBins).fill(-Infinity)
	const binMaxLat = new Float32Array(numBins)

	for (let r = 0; r < N; r++) {
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]
		const lonDeg = Math.atan2(y, x) * RAD2DEG
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * RAD2DEG
		const bin = Math.max(0, Math.min(numBins - 1,
			Math.floor((lonDeg + 180) / 360 * numBins)))
		if (temps[r] > binMaxTemp[bin]) {
			binMaxTemp[bin] = temps[r]
			binMaxLat[bin] = latDeg
		}
	}

	const smoothLat = new Float32Array(numBins)
	for (let i = 0; i < numBins; i++) {
		let sum = 0
		let count = 0
		for (let d = -TEQ_HALF_WIN; d <= TEQ_HALF_WIN; d++) {
			const j = ((i + d) % numBins + numBins) % numBins
			if (binMaxTemp[j] !== -Infinity) {
				sum += binMaxLat[j]
				count++
			}
		}
		smoothLat[i] = count > 0 ? sum / count : 0
	}

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
 * Best-first propagation from weighted ocean sources with latitude-band wind steering.
 */
export function computeAdvection(
	mesh: SphereMesh,
	elevation: Float32Array,
	distCoast: Float32Array,
	climate?: OrogenClimate,
	params?: number | Pick<OrogenParams, "planetRadiusKm">,
	isLand?: Uint8Array,
	elevation_km?: Float32Array,
): { east: Float32Array; west: Float32Array } {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const wet = 30

	const planetRadiusKm = typeof params === "number" ? params : params?.planetRadiusKm
	const avgEdgeKm = meanEdgeLengthKm(mesh, planetRadiusKm)
	const scale = 94.5 / avgEdgeKm
	const deepOceanThreshold = 1260 / avgEdgeKm

	const latDeg = new Float32Array(N)
	const lonDeg = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		latDeg[r] = Math.asin(Math.max(-1, Math.min(1, z))) * RAD2DEG
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		lonDeg[r] = Math.atan2(y, x) * RAD2DEG
	}

	const teqByLon = climate
		? computeThermalEquator(mesh, climate.temperature_avg)
		: new Float32Array(TEQ_NUM_BINS)
	const lonBinWidth = 360 / TEQ_NUM_BINS
	const regionBin = new Int32Array(N)
	for (let r = 0; r < N; r++) {
		regionBin[r] = Math.max(0, Math.min(TEQ_NUM_BINS - 1,
			Math.floor((lonDeg[r] + 180) / lonBinWidth)))
	}

	const basinLabel = new Int32Array(N).fill(-1)
	let basinCount = 0
	for (let r = 0; r < N; r++) {
		if (isLand?.[r] || elevation[r] > 0 || basinLabel[r] >= 0) continue
		const basin = basinCount++
		const stack = [r]
		basinLabel[r] = basin
		while (stack.length > 0) {
			const current = stack.pop()!
			for (let j = adjOffset[current], jEnd = adjOffset[current + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if ((isLand?.[nb] || elevation[nb] > 0) || basinLabel[nb] >= 0) continue
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
		if (!isLand?.[r] && elevation[r] <= 0 && basinLabel[r] >= 0 && basinSize[basinLabel[r]] >= minBasinSize) {
			sourceMoisture[r] = wet * smoothstep(0, deepOceanThreshold, distCoast[r])
		}
	}

	// Use provided land mask, or fall back to elevation-based classification
	const land: Uint8Array = isLand ?? (() => {
		const mask = new Uint8Array(N)
		for (let r = 0; r < N; r++) {
			if (elevation[r] > 0) mask[r] = 1
		}
		return mask
	})()

	const east = new Float32Array(N)
	const west = new Float32Array(N)

	const isValidFlow = (attr: "east" | "west", r: number, bearing: number): boolean => {
		const lat = latDeg[r]
		const absLat = Math.abs(lat)
		const teq = teqByLon[regionBin[r]]
		const distToTeq = Math.abs(lat - teq)
		const eastward = Math.sin(bearing * DEG2RAD)
		const northward = Math.cos(bearing * DEG2RAD)

		if (attr === "east") {
			const zonalStrength = piecewise([0, 10, 25, 35, 50], [0.7, 1, 1, 0.4, 0], absLat)
			const meridionalStrength = piecewise([0, 5, 15, 30, 40], [0, 0.2, 0.55, 0.8, 0], distToTeq)
			const teqDir = teq > lat ? 1 : teq < lat ? -1 : 0
			const flowEast = -zonalStrength
			const flowNorth = teqDir * meridionalStrength
			const flowNorm = Math.hypot(flowEast, flowNorth)
			if (flowNorm < 1e-6) return angleDeltaDeg(bearing, 270) <= 55
			const alignment = (eastward * flowEast + northward * flowNorth) / flowNorm
			return alignment >= 0.35
		}

		const subtropicalJet = piecewise([20, 28, 32, 40], [0, 0.75, 1.1, 0.3], absLat)
		const polarJet = piecewise([45, 52, 60, 70], [0, 0.45, 0.9, 0], absLat)
		const zonalStrength = Math.max(0.7, subtropicalJet, polarJet)
		const polewardStrength = piecewise([22, 30, 45, 60, 75], [0, 0.2, 0.55, 0.35, 0], absLat)
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
			const heightKm = elevation_km ? elevation_km[r] : elevToHeightKm(elevation[r])
			const orographic = heightKm > 2 ? -1.8 : -0.6
			const impact = (!land[r] ? 0.5 : orographic) / scale
			const m = Math.max(Math.min(Math.max(moisture[r], 0) + impact, wet), 0)

			const lat1 = latDeg[r] * DEG2RAD
			const lon1 = lonDeg[r] * DEG2RAD
			const sinLat1 = Math.sin(lat1)
			const cosLat1 = Math.cos(lat1)

			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				const lat2 = latDeg[nb] * DEG2RAD
				const dLon = lonDeg[nb] * DEG2RAD - lon1
				const bearing = (Math.atan2(
					Math.sin(dLon) * Math.cos(lat2),
					cosLat1 * Math.sin(lat2) - sinLat1 * Math.cos(lat2) * Math.cos(dLon),
				) * RAD2DEG + 360) % 360

				if (!isValidFlow(attr, r, bearing)) continue
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
		if (east[r] > west[r]) west[r] = 0
		else east[r] = 0
	}

	return { east, west }
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
	controls: CirculationControls,
): number {
	const dist = Math.abs(cellLat - teq)
	const moisture = Math.max(eastMoisture, westMoisture)
	const tropicalDist = dist / controls.hadleyWidth
	const itcz = itczScale(tropicalDist) * moisture * controls.hadleyWetStrength
	const suppression = 1 - clamp(
		subsidenceScale(tropicalDist) * controls.hadleyDryStrength,
		0,
		1,
	)
	const eastStorms = eastStormScale(dist) * eastMoisture
	const polar = westerliesScale(dist) * westMoisture
	return clamp(Math.max(itcz * suppression, eastStorms, polar), 0, 1)
}

// ---------------------------------------------------------------------------
// Tidally locked rainfall: convection-driven from substellar point
// ---------------------------------------------------------------------------

/**
 * Rainfall for a tidally locked planet. Convective uplift concentrates
 * near the substellar point; rain tapers smoothly toward the terminator
 * and is near-zero on the nightside. Uses temperature and moisture
 * availability (ocean proximity) rather than latitude-band circulation.
 */
function computeTidalRain(
	mesh: SphereMesh,
	climate: OrogenClimate,
	isLand: Uint8Array,
	params?: Pick<OrogenParams, "seed" | "antistellarLon" | "pressure">,
): { monthly: Float32Array; annual: Float32Array } {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const sub = getSubstellarDir(params?.antistellarLon)
	const pressure = clamp(params?.pressure ?? 1, 0.1, 10)

	// Higher pressure → more heat redistribution → more moisture transport
	// past the terminator. logP: -3.3 at 0.1, 0 at 1, 3.3 at 10
	const logP = Math.log2(Math.max(0.1, pressure))
	// Terminator convergence strength:
	//   0.1bar → ~0.02, 1bar → 0.1, 3bar → 0.25, 10bar → 0.5
	const terminatorStrength = clamp(0.1 + logP * 0.12, 0.02, 0.55)
	// Nightside drizzle: zero at ≤1bar, ramps up only at high pressure
	//   1bar → 0, 3bar → ~0.05, 10bar → ~0.13
	const nightsideDrizzle = clamp((logP - 0.5) * 0.05, 0, 0.15)

	// Compute angular distance from substellar point for each cell
	const cosTheta = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		cosTheta[r] = Math.max(-1, Math.min(1,
			mesh.r_xyz[3 * r] * sub[0] +
			mesh.r_xyz[3 * r + 1] * sub[1] +
			mesh.r_xyz[3 * r + 2] * sub[2]))
	}

	// Noise to break up perfectly smooth concentric rainfall rings.
	const seed = params?.seed ?? 0
	const sn1 = new SimplexNoise(seed + 4001)
	const sn2 = new SimplexNoise(seed + 4002)
	const FREQ1 = 3.0
	const FREQ2 = 7.0
	const AMP1 = 0.35
	const AMP2 = 0.15

	// Three rainfall sources:
	// 1) Substellar convection: cos⁴ falloff, peaks at substellar
	// 2) Terminator convergence: ring where warm dayside air meets cold nightside
	// 3) Nightside drizzle: advected moisture condensing in cold sinking air
	const monthly = new Float32Array(N * 12)
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		const ct = cosTheta[r]
		const thetaDeg = Math.acos(clamp(ct, -1, 1)) * (180 / Math.PI)

		const temp = climate.temperature_avg[r]
		const ceiling = ceilingScale(temp)

		// 1) Substellar convection: cos⁴, dayside only
		const convection = ct > 0 ? ct * ct * ct * ct : 0

		// 2) Terminator convergence ring: bell curve peaking ~85° from substellar
		//    Warm moist air collides with cold nightside air → forced uplift
		const termDist = Math.abs(thetaDeg - 85)
		const terminator = Math.exp(-termDist * termDist / (2 * 18 * 18)) * terminatorStrength

		// 3) Nightside drizzle: gentle falloff past the terminator
		//    Advected moisture condenses as it cools; fades toward antistellar
		const nightside = ct < 0.1
			? nightsideDrizzle * clamp(1 - (thetaDeg - 95) / 70, 0, 1)
			: 0

		const weight = convection + terminator + nightside

		// Multiplicative noise: breaks up uniform concentric bands
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]
		const n = sn1.noise3D(x * FREQ1, y * FREQ1, z * FREQ1) * AMP1
			+ sn2.noise3D(x * FREQ2, y * FREQ2, z * FREQ2) * AMP2
		const noiseMul = Math.max(0, 1 + n)

		const rain = weight * ceiling * noiseMul
		for (let month = 0; month < 12; month++) {
			monthly[month * N + r] = rain
		}
	}

	// Smooth 3 passes (same as regular model)
	const smoothBuf = new Float32Array(N)
	for (let pass = 0; pass < 3; pass++) {
		for (let month = 0; month < 12; month++) {
			const offset = month * N
			for (let r = 0; r < N; r++) {
				if (!isLand[r]) { smoothBuf[r] = 0; continue }
				let sum = 0
				let count = 0
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					if (isLand[nb]) {
						sum += monthly[offset + nb]
						count++
					}
				}
				sum += monthly[offset + r]
				count++
				smoothBuf[r] = sum / count
			}
			for (let r = 0; r < N; r++) {
				if (isLand[r]) monthly[offset + r] = smoothBuf[r]
			}
		}
	}

	const annual = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let sum = 0
		for (let month = 0; month < 12; month++) {
			sum += monthly[month * N + r]
		}
		annual[r] = sum
	}

	return { monthly, annual }
}

/**
 * Compute monthly and annual rainfall for all regions.
 */
export function computeMonthlyRain(
	mesh: SphereMesh,
	climate: OrogenClimate,
	eastAdv: Float32Array,
	westAdv: Float32Array,
	isLand: Uint8Array,
	params?: Pick<OrogenParams, "obliquity" | "daysPerYear" | "hoursPerDay" | "tidallyLocked" | "antistellarLon" | "pressure" | "seed">,
	monthlyTEQ?: Float32Array[],
): { monthly: Float32Array; annual: Float32Array } {
	if (isTidallyLocked(params?.tidallyLocked)) {
		return computeTidalRain(mesh, climate, isLand, params)
	}

	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const reverseCirculation = isRetrogradeObliquity(params?.obliquity)
	const circulation = getCirculationControls(params)
	// Lower pressure → easier evaporation → more rain; higher → suppressed
	// ~1/p^0.4: 0.1bar→2.5x, 0.25→1.6x, 0.5→1.3x, 1→1x, 2→0.76x, 4→0.57x, 10→0.40x
	const pressureRainFactor = Math.pow(1 / (params?.pressure ?? 1.0), 0.4)

	const latDeg = new Float32Array(N)
	const lonDeg = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		latDeg[r] = Math.asin(Math.max(-1, Math.min(1, z))) * RAD2DEG
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		lonDeg[r] = Math.atan2(y, x) * RAD2DEG
	}

	const lonBinWidth = 360 / TEQ_NUM_BINS
	const regionBin = new Int32Array(N)
	for (let r = 0; r < N; r++) {
		regionBin[r] = Math.max(0, Math.min(TEQ_NUM_BINS - 1,
			Math.floor((lonDeg[r] + 180) / lonBinWidth)))
	}

	const teqPerMonth: Float32Array[] = monthlyTEQ ?? (() => {
		const result: Float32Array[] = new Array(12)
		for (let month = 0; month < 12; month++) {
			result[month] = computeThermalEquator(mesh, climate.temperature_monthly.subarray(month * N, (month + 1) * N))
		}
		return result
	})()

	const monthly = new Float32Array(N * 12)
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		const e = reverseCirculation ? westAdv[r] : eastAdv[r]
		const w = reverseCirculation ? eastAdv[r] : westAdv[r]
		const bin = regionBin[r]
		for (let month = 0; month < 12; month++) {
			const teq = teqPerMonth[month][bin]
			const weight = computeWeight(latDeg[r], teq, e, w, circulation)
			const monthTemp = climate.temperature_monthly[month * N + r]
			monthly[month * N + r] = weight * ceilingScale(monthTemp) * pressureRainFactor
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

		for (let r = 0; r < N; r++) {
			if (!isLand[r]) continue
			const x = mesh.r_xyz[3 * r]
			const y = mesh.r_xyz[3 * r + 1]
			const z = mesh.r_xyz[3 * r + 2]
			const n = sn1.noise3D(x * FREQ1, y * FREQ1, z * FREQ1) * AMP1
				+ sn2.noise3D(x * FREQ2, y * FREQ2, z * FREQ2) * AMP2
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
			for (let r = 0; r < N; r++) {
				if (!isLand[r]) { smoothBuf[r] = 0; continue }
				let sum = 0
				let count = 0
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					if (isLand[nb]) {
						sum += monthly[offset + nb]
						count++
					}
				}
				sum += monthly[offset + r]
				count++
				smoothBuf[r] = sum / count
			}
			for (let r = 0; r < N; r++) {
				if (isLand[r]) monthly[offset + r] = smoothBuf[r]
			}
		}
	}

	const annual = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let sum = 0
		for (let month = 0; month < 12; month++) {
			sum += monthly[month * N + r]
		}
		annual[r] = sum
	}

	return { monthly, annual }
}

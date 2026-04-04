import type { OrogenClimate, OrogenParams, SphereMesh } from "../types"
import {
	getDaysPerYear,
	getHoursPerDay,
	getPlanetRadiusKm,
	isRetrogradeObliquity,
	isTidallyLocked,
} from "../units"
import { computeThermalEquator } from "./rain"

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
const AIR_GAS_CONSTANT = 287
const NUM_LAT_BANDS = 36
const NUM_MONTHS = 12
const TEQ_BINS = 120

export interface WindResult {
	wind_east_monthly: Float32Array
	wind_north_monthly: Float32Array
	wind_speed_monthly: Float32Array
}

function clamp(x: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, x))
}

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

function interpolateBands(values: Float32Array, latDeg: number): number {
	const pos = clamp(
		((latDeg + 90) / 180) * (NUM_LAT_BANDS - 1),
		0,
		NUM_LAT_BANDS - 1,
	)
	const i0 = Math.floor(pos)
	const i1 = Math.min(NUM_LAT_BANDS - 1, i0 + 1)
	const t = pos - i0
	return values[i0] * (1 - t) + values[i1] * t
}

function smoothField(
	mesh: SphereMesh,
	field: Float32Array,
	passes: number,
	tmp?: Float32Array,
): void {
	const { adjOffset, adjList, numRegions: N } = mesh
	const buf = tmp ?? new Float32Array(N)
	for (let pass = 0; pass < passes; pass++) {
		for (let r = 0; r < N; r++) {
			let sum = field[r]
			let count = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				sum += field[adjList[j]]
				count++
			}
			buf[r] = sum / count
		}
		field.set(buf)
	}
}

function fillMissingBands(values: Float32Array, counts: Uint16Array): void {
	let nearest = -1
	for (let i = 0; i < values.length; i++) {
		if (counts[i] > 0) {
			nearest = i
			continue
		}
		let right = i + 1
		while (right < values.length && counts[right] === 0) right++
		if (nearest < 0 && right >= values.length) {
			values[i] = 0
		} else if (nearest < 0) {
			values[i] = values[right]
		} else if (right >= values.length) {
			values[i] = values[nearest]
		} else {
			const leftDist = i - nearest
			const rightDist = right - i
			values[i] = leftDist <= rightDist ? values[nearest] : values[right]
		}
	}
}

function computeMonthlyBandTemperatures(
	climate: OrogenClimate,
	latBandByRegion: Uint8Array,
	numRegions: number,
): Float32Array[] {
	const result: Float32Array[] = new Array(NUM_MONTHS)
	const sums = new Float64Array(NUM_LAT_BANDS)
	const counts = new Uint16Array(NUM_LAT_BANDS)

	for (let month = 0; month < NUM_MONTHS; month++) {
		sums.fill(0)
		counts.fill(0)
		const offset = month * numRegions
		for (let r = 0; r < numRegions; r++) {
			const band = latBandByRegion[r]
			sums[band] += climate.temperature_monthly[offset + r]
			counts[band]++
		}

		const values = new Float32Array(NUM_LAT_BANDS)
		for (let band = 0; band < NUM_LAT_BANDS; band++) {
			values[band] = counts[band] > 0 ? sums[band] / counts[band] : 0
		}
		fillMissingBands(values, counts)

		const smoothed = new Float32Array(NUM_LAT_BANDS)
		for (let band = 0; band < NUM_LAT_BANDS; band++) {
			let sum = values[band]
			let weight = 1
			if (band > 0) {
				sum += values[band - 1]
				weight++
			}
			if (band + 1 < NUM_LAT_BANDS) {
				sum += values[band + 1]
				weight++
			}
			smoothed[band] = sum / weight
		}
		result[month] = smoothed
	}

	return result
}

function zonalProfile(distDeg: number): number {
	return piecewise(
		[0, 5, 12, 22, 30, 35, 45, 55, 65, 75, 90],
		[-0.1, -0.2, -0.6, -0.4, -0.1, 0.3, 0.9, 0.5, 0.1, -0.3, -0.4],
		distDeg,
	)
}

type CirculationControls = {
	hadleyWidth: number
	zonalScale: number
	meridionalScale: number
}

function getCirculationControls(
	params?: Pick<
		OrogenParams,
		"daysPerYear" | "hoursPerDay" | "tidallyLocked" | "pressure"
	>,
): CirculationControls {
	if (isTidallyLocked(params?.tidallyLocked)) {
		return {
			hadleyWidth: 2.4,
			zonalScale: 0.2,
			meridionalScale: 1.9,
		}
	}

	const dayHours = getHoursPerDay(params?.hoursPerDay)
	const yearDays = getDaysPerYear(params?.daysPerYear)
	const pressure = clamp(params?.pressure ?? 1, 0.1, 10)

	return {
		hadleyWidth: clamp(Math.pow(dayHours / 24, 0.35), 0.65, 1.9),
		zonalScale: clamp(
			Math.pow(24 / dayHours, 0.2) * Math.pow(pressure, 0.08),
			0.65,
			1.6,
		),
		meridionalScale: clamp(
			Math.pow(yearDays / 365, 0.15) / Math.pow(pressure, 0.08),
			0.6,
			1.8,
		),
	}
}

function computeMonthlyEkman(
	monthlyBandTemps: Float32Array[],
	params?: Pick<
		OrogenParams,
		"planetRadiusKm" | "hoursPerDay" | "pressure" | "tidallyLocked"
	>,
): Float32Array[] {
	const radiusM = getPlanetRadiusKm(params?.planetRadiusKm) * 1000
	const hoursPerDay = getHoursPerDay(params?.hoursPerDay)
	const omega = isTidallyLocked(params?.tidallyLocked)
		? 0
		: (2 * Math.PI) / (hoursPerDay * 3600)
	const pressure = clamp(params?.pressure ?? 1, 0.1, 10)
	const friction = 0.75e-4 / Math.sqrt(pressure)
	const latStepRad = Math.PI / (NUM_LAT_BANDS - 1)
	const bandLatsRad = new Float64Array(NUM_LAT_BANDS)
	for (let i = 0; i < NUM_LAT_BANDS; i++)
		bandLatsRad[i] = (-90 + i * (180 / (NUM_LAT_BANDS - 1))) * DEG2RAD

	return monthlyBandTemps.map((temps) => {
		const ekman = new Float32Array(NUM_LAT_BANDS)
		for (let i = 0; i < NUM_LAT_BANDS; i++) {
			let dT = 0
			let dy = radiusM * latStepRad
			if (i === 0) {
				dT = temps[i + 1] - temps[i]
			} else if (i === NUM_LAT_BANDS - 1) {
				dT = temps[i] - temps[i - 1]
			} else {
				dT = temps[i + 1] - temps[i - 1]
				dy = radiusM * latStepRad * 2
			}
			const gradT = Math.abs(dT / Math.max(dy, 1))
			const f = Math.abs(2 * omega * Math.sin(bandLatsRad[i]))
			ekman[i] =
				(AIR_GAS_CONSTANT * gradT) / Math.sqrt(f * f + friction * friction)
		}
		return ekman
	})
}

function getProfileMultiplier(
	latDeg: number,
	teqDeg: number,
	hadleyWidth: number,
): number {
	const dist = Math.abs(latDeg - teqDeg) / hadleyWidth
	const teqDisplacement = Math.abs(teqDeg) / 90
	const profileWeight = 1 - 0.7 * teqDisplacement
	const raw = zonalProfile(dist)
	const direction = Math.sign(raw) || -1
	return profileWeight * raw + (1 - profileWeight) * direction
}

function getMeridionalMultiplier(
	latDeg: number,
	teqDeg: number,
	hadleyWidth: number,
	tidallyLocked: boolean,
): number {
	const signedDist = (latDeg - teqDeg) / hadleyWidth
	const absDist = Math.abs(signedDist)

	if (tidallyLocked) {
		const towardThermalEquator = piecewise(
			[0, 3, 12, 30, 60, 90],
			[0.0, 0.15, 0.85, 0.55, 0.15, 0],
			absDist,
		)
		return Math.sign(teqDeg - latDeg) * towardThermalEquator
	}

	if (absDist < 30) {
		return (
			Math.sign(teqDeg - latDeg) *
			piecewise([0, 3, 12, 22, 30], [0.0, 0.15, 0.8, 0.5, 0.0], absDist)
		)
	}
	if (absDist < 60) {
		return (
			Math.sign(latDeg - teqDeg) *
			piecewise([25, 38, 52, 60], [0, 0.2, 0.4, 0.15], absDist)
		)
	}
	return (
		Math.sign(teqDeg - latDeg) *
		piecewise([55, 70, 90], [0, 0.18, 0.28], absDist)
	)
}

function continentalityDampener(
	isLand: number,
	landNeighborFrac: number,
): number {
	if (!isLand) return 1
	// Coastal land cells get partial ocean benefit
	// Deep interior land gets full friction penalty
	// Ocean roughness ~0.0002, land ~0.01-0.05
	return 0.55 + 0.35 * (1 - landNeighborFrac)
}

export function computeWind(
	mesh: SphereMesh,
	_elevation: Float32Array,
	isLand: Uint8Array,
	climate: OrogenClimate,
	params?: Pick<
		OrogenParams,
		| "planetRadiusKm"
		| "obliquity"
		| "daysPerYear"
		| "hoursPerDay"
		| "tidallyLocked"
		| "pressure"
	>,
	monthlyTEQ?: Float32Array[],
): WindResult {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const reverseZonal = isRetrogradeObliquity(params?.obliquity) ? -1 : 1
	const controls = getCirculationControls(params)

	// Precompute land neighbor fraction for continentality dampening
	const landNeighborFrac = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		let landCount = 0
		let total = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			if (isLand[adjList[j]]) landCount++
			total++
		}
		landNeighborFrac[r] = total > 0 ? landCount / total : 0
	}
	const monthlyBandTemps = computeMonthlyBandTemperatures(
		climate,
		(() => {
			const latBandByRegion = new Uint8Array(N)
			for (let r = 0; r < N; r++) {
				const z = mesh.r_xyz[3 * r + 2]
				const latDeg = Math.asin(clamp(z, -1, 1)) * RAD2DEG
				latBandByRegion[r] = clamp(
					Math.round(((latDeg + 90) / 180) * (NUM_LAT_BANDS - 1)),
					0,
					NUM_LAT_BANDS - 1,
				)
			}
			return latBandByRegion
		})(),
		N,
	)
	const monthlyEkman = computeMonthlyEkman(monthlyBandTemps, params)

	const latDeg = new Float32Array(N)
	const lonBin = new Uint16Array(N)
	for (let r = 0; r < N; r++) {
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]
		latDeg[r] = Math.asin(clamp(z, -1, 1)) * RAD2DEG
		const lonDeg = Math.atan2(y, x) * RAD2DEG
		lonBin[r] = clamp(
			Math.floor(((lonDeg + 180) / 360) * TEQ_BINS),
			0,
			TEQ_BINS - 1,
		)
	}

	const wind_east_monthly = new Float32Array(N * NUM_MONTHS)
	const wind_north_monthly = new Float32Array(N * NUM_MONTHS)
	const wind_speed_monthly = new Float32Array(N * NUM_MONTHS)

	// Pool reusable buffers across months
	const smoothBuf = new Float32Array(N)
	const east = new Float32Array(N)
	const north = new Float32Array(N)
	const tlocked = isTidallyLocked(params?.tidallyLocked)

	for (let month = 0; month < NUM_MONTHS; month++) {
		const offset = month * N
		const teqByLon = monthlyTEQ
			? monthlyTEQ[month]
			: computeThermalEquator(
					mesh,
					climate.temperature_monthly.subarray(offset, offset + N),
					TEQ_BINS,
				)

		for (let r = 0; r < N; r++) {
			const teq = teqByLon[lonBin[r]]
			const baseMagnitude = interpolateBands(monthlyEkman[month], latDeg[r])
			const zonal =
				getProfileMultiplier(latDeg[r], teq, controls.hadleyWidth) *
				controls.zonalScale *
				reverseZonal
			const meridional =
				getMeridionalMultiplier(latDeg[r], teq, controls.hadleyWidth, tlocked) *
				controls.meridionalScale
			const drag = continentalityDampener(isLand[r], landNeighborFrac[r])

			east[r] = baseMagnitude * zonal * drag
			north[r] = baseMagnitude * meridional * drag
		}

		smoothField(mesh, east, 2, smoothBuf)
		smoothField(mesh, north, 2, smoothBuf)

		for (let r = 0; r < N; r++) {
			wind_speed_monthly[offset + r] = Math.hypot(east[r], north[r])
		}

		wind_east_monthly.set(east, offset)
		wind_north_monthly.set(north, offset)
	}

	return { wind_east_monthly, wind_north_monthly, wind_speed_monthly }
}

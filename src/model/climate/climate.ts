/**
 * EBM temperature layer for the orogen pipeline.
 * Computes land fraction from mesh elevation, runs the energy balance model,
 * and maps zonal temperatures to per-cell with elevation lapse rate correction.
 */

import type { OrogenClimate, OrogenParams, SphereMesh } from ".."
import { SimplexNoise } from "../shared/simplex-noise"
import { TIME } from "../shared/time"
import { getEffectiveObliquityDeg } from "../shared/units"

import { EMB_CONSTANTS } from "./ebm/constants"
import { EnergyBalanceModel } from "./ebm/index"
import { INSOLATION } from "./ebm/insolation"
import {
	computeLockedMonthlyDaylightHours,
	computeTidalTemperature,
} from "./locked/heat"

const NUM_LAT = EMB_CONSTANTS.grid.NUM_LAT // 36
const MONTH_DAY_COUNTS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const LAT_STEP_INV = (NUM_LAT - 1) / 180 // O(1) uniform-grid interpolation
const RAD_TO_DEG = 180 / Math.PI

interface MeshLatitudeGeometry {
	latDegByRegion: Float64Array
	latBandByRegion: Uint8Array
}

const meshLatitudeGeometryCache = new WeakMap<
	SphereMesh,
	MeshLatitudeGeometry
>()

function getMeshLatitudeGeometry(mesh: SphereMesh): MeshLatitudeGeometry {
	const cached = meshLatitudeGeometryCache.get(mesh)
	if (cached) return cached

	const latDegByRegion = new Float64Array(mesh.numRegions)
	const latBandByRegion = new Uint8Array(mesh.numRegions)

	for (let r = 0; r < mesh.numRegions; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * RAD_TO_DEG
		latDegByRegion[r] = latDeg
		latBandByRegion[r] = Math.max(
			0,
			Math.min(NUM_LAT - 1, Math.floor(((latDeg + 90) / 180) * NUM_LAT)),
		)
	}

	const geometry = { latDegByRegion, latBandByRegion }
	meshLatitudeGeometryCache.set(mesh, geometry)
	return geometry
}

/** Fast piecewise-linear interpolation for uniformly-spaced latitude bands (-90..90). */
function interpolateLatBand(range: number[], latDeg: number): number {
	const pos = Math.max(0, Math.min(NUM_LAT - 1, (latDeg + 90) * LAT_STEP_INV))
	const i0 = Math.min(NUM_LAT - 2, pos | 0)
	const t = pos - i0
	return range[i0] + t * (range[i0 + 1] - range[i0])
}

/** Convert raw mesh elevation to physical height in km.
 *  maxElevKm controls peak mountain height (default 6, Earth-like).
 *  maxDepthKm controls ocean floor depth at elev=-1 (default 10). */
export function elevToHeightKm(
	elev: number,
	maxElevKm = 6,
	maxDepthKm = 10,
): number {
	if (elev <= 0) return elev * maxDepthKm
	const t = Math.min(elev, 1)
	const t2 = t * t
	return maxElevKm * t2 * t2 * (5 - 4 * t)
}

/** Bin regions into 36 latitude bands, count land fraction per band. */
export function computeLandFraction(
	mesh: SphereMesh,
	isLand: Uint8Array,
): number[] {
	const { latBandByRegion } = getMeshLatitudeGeometry(mesh)
	const landCount = new Float64Array(NUM_LAT)
	const totalCount = new Float64Array(NUM_LAT)

	for (let r = 0; r < mesh.numRegions; r++) {
		const band = latBandByRegion[r]
		totalCount[band]++
		if (isLand[r]) landCount[band]++
	}

	const landFraction: number[] = new Array(NUM_LAT)
	for (let i = 0; i < NUM_LAT; i++) {
		const frac = totalCount[i] > 0 ? landCount[i] / totalCount[i] : 0
		landFraction[i] = Math.min(frac, 0.8) // cap at 0.8 matching existing EBM
	}
	return landFraction
}

function computeMonthlyDaylightHours(
	mesh: SphereMesh,
	params: OrogenParams,
): Float32Array {
	const N = mesh.numRegions
	const { latDegByRegion } = getMeshLatitudeGeometry(mesh)
	const monthly = new Float32Array(N * 12)
	const hoursPerDay = params.hoursPerDay

	if (params.tidallyLocked) {
		return computeLockedMonthlyDaylightHours(mesh, params)
	}

	const lats = Array.from(
		{ length: EMB_CONSTANTS.grid.NUM_LAT },
		(_, i) => -Math.PI / 2 + (Math.PI * i) / (EMB_CONSTANTS.grid.NUM_LAT - 1),
	)
	const { _daylight_hours } = INSOLATION.compute(
		lats,
		{
			...EMB_CONSTANTS.orbital,
			OBLIQUITY: getEffectiveObliquityDeg(params.obliquity),
			ECCENTRICITY: params.eccentricity,
			PERIHELION: params.perihelion,
		},
		{
			...EMB_CONSTANTS.stellar,
			T_SUN: EMB_CONSTANTS.stellar.T_SUN * params.sunTempFactor,
		},
	)
	const monthlyRanges: number[][] = new Array(12)
	for (let month = 0; month < 12; month++) {
		const days = TIME.month.days(month)
		monthlyRanges[month] = _daylight_hours.map(
			(row) =>
				(days.reduce((sum, day) => sum + row[day], 0) /
					Math.max(1, days.length)) *
				(hoursPerDay / 24),
		)
	}

	for (let r = 0; r < N; r++) {
		for (let month = 0; month < 12; month++) {
			monthly[month * N + r] = interpolateLatBand(
				monthlyRanges[month],
				latDegByRegion[r],
			)
		}
	}

	return monthly
}

/**
 * Applies simplex noise to break up smooth temperature isotherms.
 * `computeTaper(r, x, y, z)` returns a per-cell blend weight [0, 1].
 * `includeCell(r)` gates which cells are processed.
 * When avg/min/max arrays are provided they also receive the offset.
 */
export function applyTemperatureNoise(
	mesh: SphereMesh,
	N: number,
	seed: number,
	temperature_monthly: Float32Array,
	temperature_monthly_nolapse: Float32Array,
	computeTaper: (r: number, x: number, y: number, z: number) => number,
	includeCell: (r: number) => boolean,
	temperature_avg?: Float32Array,
	temperature_min?: Float32Array,
	temperature_max?: Float32Array,
): void {
	const sn1 = new SimplexNoise(seed + 3001)
	const sn2 = new SimplexNoise(seed + 3002)
	const FREQ1 = 3.0
	const FREQ2 = 7.0
	const AMP1 = 3.0
	const AMP2 = 1.2

	for (let r = 0; r < N; r++) {
		if (!includeCell(r)) continue
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]

		const taper = computeTaper(r, x, y, z)
		const n =
			sn1.noise3D(x * FREQ1, y * FREQ1, z * FREQ1) * AMP1 +
			sn2.noise3D(x * FREQ2, y * FREQ2, z * FREQ2) * AMP2
		const offset = n * Math.max(0, taper)

		if (temperature_avg) temperature_avg[r] += offset
		if (temperature_min) temperature_min[r] += offset
		if (temperature_max) temperature_max[r] += offset
		for (let month = 0; month < 12; month++) {
			temperature_monthly[month * N + r] += offset
			temperature_monthly_nolapse[month * N + r] += offset
		}
	}
}

export function recomputeAnnualTemperatureStats(
	temperature_monthly: Float32Array,
	temperature_avg: Float32Array,
	temperature_min: Float32Array,
	temperature_max: Float32Array,
	N: number,
): void {
	for (let r = 0; r < N; r++) {
		let sum = 0
		let min = Infinity
		let max = -Infinity
		for (let month = 0; month < 12; month++) {
			const value = temperature_monthly[month * N + r]
			sum += value
			if (value < min) min = value
			if (value > max) max = value
		}
		temperature_avg[r] = sum / 12
		temperature_min[r] = min
		temperature_max[r] = max
	}
}

export function applyDtrToClimateMinMax(
	climate: OrogenClimate,
	dtr_monthly: Float32Array,
	N: number,
): void {
	for (let r = 0; r < N; r++) {
		let maxT = -Infinity
		let minT = Infinity
		for (let m = 0; m < 12; m++) {
			const mean = climate.temperature_monthly[m * N + r]
			const half = dtr_monthly[m * N + r] * 0.5
			if (mean + half > maxT) maxT = mean + half
			if (mean - half < minT) minT = mean - half
		}
		climate.temperature_max[r] = maxT
		climate.temperature_min[r] = minT
	}
}

/** Run EBM and map zonal temperatures to per-cell with lapse rate + continentality correction. */
export function computeTemperature(
	mesh: SphereMesh,
	elevation: Float32Array,
	landFraction: number[],
	params: OrogenParams,
	oceanDist?: Float32Array,
	isLand?: Uint8Array,
	elevation_km?: Float32Array,
): OrogenClimate {
	if (params.tidallyLocked) {
		return computeTidalTemperature(
			mesh,
			elevation,
			landFraction,
			params,
			oceanDist,
			elevation_km,
		)
	}

	const ebm = new EnergyBalanceModel({
		orbital: {
			OBLIQUITY: getEffectiveObliquityDeg(params.obliquity),
			ECCENTRICITY: params.eccentricity,
			PERIHELION: params.perihelion,
		},
		stellar: {
			...EMB_CONSTANTS.stellar,
			T_SUN: EMB_CONSTANTS.stellar.T_SUN * params.sunTempFactor,
		},
		time: {
			YEAR_LENGTH_DAYS: params.daysPerYear,
			HOURS_PER_DAY: params.hoursPerDay,
		},
		pressure: params.pressure ?? 1.0,
		radius: params.planetRadiusKm * 1000,
		landFraction,
		insolationFactor: params.insolationFactor,
	})
	ebm.runModel(30, 0.5)
	const daylight_hours_monthly = computeMonthlyDaylightHours(mesh, params)
	// Build interpolation ranges: latitude bands → zonal temperature, range, and insolation
	let dayStart = 0
	const monthlyRanges: number[][] = new Array(12)
	const monthlyRangeRanges: number[][] = new Array(12)
	const monthlyInsolRanges: number[][] = new Array(12)
	for (let m = 0; m < 12; m++) {
		const start = dayStart
		const end = start + MONTH_DAY_COUNTS[m]
		dayStart = end
		monthlyRanges[m] = ebm.temperature.map((row) => {
			let sum = 0
			for (let d = start; d < end; d++) sum += row[d]
			return sum / (end - start)
		})
		monthlyRangeRanges[m] = ebm.temperature.map((row) => {
			let min = Infinity,
				max = -Infinity
			for (let d = start; d < end; d++) {
				if (row[d] < min) min = row[d]
				if (row[d] > max) max = row[d]
			}
			return max - min
		})
		monthlyInsolRanges[m] = ebm.insolation.map((row) => {
			let sum = 0
			for (let d = start; d < end; d++) sum += row[d]
			return sum / (end - start)
		})
	}

	const N = mesh.numRegions
	const temperature_avg = new Float32Array(N)
	const temperature_min = new Float32Array(N)
	const temperature_max = new Float32Array(N)
	const temperature_monthly = new Float32Array(N * 12)
	const temperature_monthly_nolapse = new Float32Array(N * 12)
	const temperature_monthly_range = new Float32Array(N * 12)
	const insolation_monthly = new Float32Array(N * 12)
	const pet_monthly = new Float32Array(N * 12)

	const gravityRatio = params.planetRadiusKm / 6371
	const LAPSE_RATE = 6.5 * gravityRatio // °C per km, scaled by surface gravity

	// Convert ocean distance from km to miles for continentality model
	const KM_TO_MI = 0.621371

	for (let r = 0; r < N; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
		const hKm = elevation_km ? elevation_km[r] : elevToHeightKm(elevation[r])
		const lapseCorrection = isLand[r] ? hKm * LAPSE_RATE : 0

		const annualAvg =
			interpolateLatBand(ebm.temperature_avg, latDeg) - lapseCorrection

		// Continentality: scale seasonal deviation from annual mean
		// Ocean (0 mi): factor ≈ 0.78 (damped), coast (~300 mi): factor ≈ 1.0, deep inland: → 1.75
		// Taper toward poles: less solar energy = lower ceiling for continental amplification
		const distMiles = oceanDist ? oceanDist[r] * KM_TO_MI : 0
		const absLat = Math.abs(latDeg)
		const polarTaper = absLat > 55 ? 1 - (absLat - 55) / 35 : 1 // linear fade 55°–90°
		const maxAmplitude = 0.75 * Math.max(0, polarTaper)
		const inertiaFactor = oceanDist
			? 1 + maxAmplitude * Math.tanh((distMiles - 300) / 1000)
			: 1

		for (let month = 0; month < 12; month++) {
			const zonalMonthNoLapse = interpolateLatBand(monthlyRanges[month], latDeg)
			const zonalMonth = zonalMonthNoLapse - lapseCorrection
			temperature_monthly[month * N + r] =
				annualAvg + (zonalMonth - annualAvg) * inertiaFactor
			temperature_monthly_nolapse[month * N + r] =
				annualAvg + lapseCorrection + (zonalMonth - annualAvg) * inertiaFactor
			// Range scales with continentality; insolation is purely astronomical
			temperature_monthly_range[month * N + r] =
				interpolateLatBand(monthlyRangeRanges[month], latDeg) * inertiaFactor
			insolation_monthly[month * N + r] = interpolateLatBand(
				monthlyInsolRanges[month],
				latDeg,
			)
		}
	}

	// ── Ocean SST noise: break up straight latitude bands ──────────────
	// Applied only to ocean cells; amplitude tapers toward equator and poles.
	if (isLand) {
		applyTemperatureNoise(
			mesh,
			N,
			params.seed ?? 0,
			temperature_monthly,
			temperature_monthly_nolapse,
			(_r, _x, _y, z) => Math.min(1, Math.abs(z) / 0.35),
			(r) => !isLand![r],
			temperature_avg,
			temperature_min,
			temperature_max,
		)
	}

	recomputeAnnualTemperatureStats(
		temperature_monthly,
		temperature_avg,
		temperature_min,
		temperature_max,
		N,
	)

	return {
		temperature_avg,
		temperature_min,
		temperature_max,
		temperature_monthly,
		temperature_monthly_nolapse,
		temperature_monthly_range,
		insolation_monthly,
		pet_monthly,
		daylight_hours_monthly,
		landFraction,
	}
}

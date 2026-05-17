/**
 * EBM temperature layer for the orogen pipeline.
 * Computes land fraction from mesh elevation, runs the energy balance model,
 * and maps zonal temperatures to per-cell with elevation lapse rate correction.
 */

import type { OrogenClimate, OrogenParams, SphereMesh } from ".."
import { SimplexNoise } from "../shared/simplex-noise"
import { TIME } from "../shared/time"
import { getEffectiveObliquityDeg, getSubstellarDir } from "../shared/units"
import { clampVolcanism, getVolcanismOverdrive } from "../shared/volcanism"
import {
	OROGEN_TERRAIN_FEATURE,
	type OrogenTerrainFeatures,
} from "../types/tectonics"
import { EMB_CONSTANTS } from "./ebm/constants"
import { EnergyBalanceModel } from "./ebm/index"
import { INSOLATION } from "./ebm/insolation"

const NUM_LAT = EMB_CONSTANTS.grid.NUM_LAT // 36
const MONTH_DAY_COUNTS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const LAT_STEP_INV = (NUM_LAT - 1) / 180 // O(1) uniform-grid interpolation
const RAD_TO_DEG = 180 / Math.PI
const VOLCANIC_ARC_MASK = 1 << (OROGEN_TERRAIN_FEATURE.VOLCANIC_ARC - 1)
const LARGE_IGNEOUS_PROVINCE_MASK =
	1 << (OROGEN_TERRAIN_FEATURE.LARGE_IGNEOUS_PROVINCE - 1)

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

function clampAcosInput(value: number): number {
	return Math.max(-1, Math.min(1, value))
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value))
}

function smoothstep01(value: number): number {
	const t = clamp01(value)
	return t * t * (3 - 2 * t)
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

// ---------------------------------------------------------------------------
// Tidally locked analytic temperature model
// ---------------------------------------------------------------------------

function computeMonthlyOrbitalFlux(params: OrogenParams): number[] {
	const { SIGMA, T_SUN, R_SUN, AU } = EMB_CONSTANTS.stellar
	const effectiveTSun = T_SUN * params.sunTempFactor
	const s0 =
		(SIGMA * Math.pow(effectiveTSun, 4) * Math.pow(R_SUN, 2)) / Math.pow(AU, 2)
	const ecc = params.eccentricity
	const PI = Math.PI
	const perihelionRad = (params.perihelion * Math.PI) / 180
	const longP = perihelionRad + PI
	const equinoxOffsetRad = (40 * 2 * Math.PI) / EMB_CONSTANTS.time.DAYS_PER_YEAR

	const calcEccFromTrue = (
		trueAnomaly: number,
		eccentricity: number,
	): number => {
		const acosInput = clampAcosInput(
			(eccentricity + Math.cos(trueAnomaly)) /
				(1 + eccentricity * Math.cos(trueAnomaly)),
		)
		if (trueAnomaly > PI) {
			return 2 * PI - Math.acos(acosInput)
		}
		return Math.acos(acosInput)
	}

	let trueL = -equinoxOffsetRad
	let trueA = trueL - longP
	while (trueA < 0) trueA += 2 * PI
	let eccA = calcEccFromTrue(trueA, ecc)
	let meanL = eccA - ecc * Math.sin(eccA) + longP

	const dailyFlux = new Array<number>(EMB_CONSTANTS.time.DAYS_PER_YEAR).fill(0)
	for (let day = 0; day < EMB_CONSTANTS.time.DAYS_PER_YEAR; day++) {
		if (day !== 0) {
			meanL += (2 * PI) / EMB_CONSTANTS.time.DAYS_PER_YEAR
			const meanA = meanL - longP
			eccA = meanA
			for (let iter = 0; iter < 10; iter++) eccA = meanA + ecc * Math.sin(eccA)
			while (eccA >= 2 * PI) eccA -= 2 * PI
			while (eccA < 0) eccA += 2 * PI
			const trueAnomalyInput = clampAcosInput(
				(Math.cos(eccA) - ecc) / (1 - ecc * Math.cos(eccA)),
			)
			trueA =
				eccA > PI
					? 2 * PI - Math.acos(trueAnomalyInput)
					: Math.acos(trueAnomalyInput)
			trueL = trueA + longP
		}

		while (trueL > 2 * PI) trueL -= 2 * PI
		while (trueL < 0) trueL += 2 * PI

		const astroDist = (1 - ecc * ecc) / (1 + ecc * Math.cos(trueA))
		dailyFlux[day] = s0 / (astroDist * astroDist)
	}

	return Array.from({ length: 12 }, (_, month) => {
		const days = TIME.month.days(month)
		return (
			days.reduce((sum, day) => sum + dailyFlux[day], 0) /
			Math.max(1, days.length)
		)
	})
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
		const sub = getSubstellarDir(params.antistellarLon)
		for (let r = 0; r < N; r++) {
			const x = mesh.r_xyz[3 * r]
			const y = mesh.r_xyz[3 * r + 1]
			const z = mesh.r_xyz[3 * r + 2]
			const cosTheta = x * sub[0] + y * sub[1] + z * sub[2]
			const daylight =
				cosTheta > 1e-6 ? hoursPerDay : cosTheta < -1e-6 ? 0 : hoursPerDay / 2
			for (let month = 0; month < 12; month++) {
				monthly[month * N + r] = daylight
			}
		}
		return monthly
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

interface TidalTransportParams {
	T_mean_C: number
	A1: number
	A_night: number
	eccAmplitude: number
	LAPSE_RATE: number
	tidalTd: number
	redistribution: number
	contrast: number
}

function computeTidalTransportParams(
	params: OrogenParams,
): TidalTransportParams {
	const radiusM = params.planetRadiusKm * 1000
	const pressure = params.pressure ?? 1.0
	const ecc = params.eccentricity
	const sunFactor = params.sunTempFactor

	const { SIGMA, T_SUN, R_SUN, AU } = EMB_CONSTANTS.stellar
	const effectiveTSun = T_SUN * sunFactor
	const S0 =
		(SIGMA * Math.pow(effectiveTSun, 4) * Math.pow(R_SUN, 2)) / Math.pow(AU, 2)
	const albedo = 0.3
	const T_eq = Math.pow((S0 * (1 - albedo)) / (4 * SIGMA), 0.25)
	const GREENHOUSE_OFFSET = 33
	const T_mean_C = T_eq - 273.15 + GREENHOUSE_OFFSET

	const radiusRatio = EMB_CONSTANTS.planet.EARTH_RADIUS / radiusM
	const radiusFactor = radiusRatio * radiusRatio
	const pressureFactor = Math.pow(pressure, 0.5)
	const yearFactor = Math.pow(
		params.daysPerYear / EMB_CONSTANTS.time.DAYS_PER_YEAR,
		0.25,
	)
	const transportFactor = radiusFactor * pressureFactor * yearFactor

	const redistribution = Math.max(
		0.2,
		Math.min(0.85, 0.5 + 0.18 * Math.tanh((transportFactor - 1) * 1.5)),
	)
	const contrast = 1 - redistribution

	const A1 = 60 * contrast
	const A_night = -80 * contrast
	const eccAmplitude = ecc * 8
	const gravityRatio = params.planetRadiusKm / 6371
	const LAPSE_RATE = 6.5 * gravityRatio
	const tidalTd = Math.max(5, 2 * eccAmplitude)

	return {
		T_mean_C,
		A1,
		A_night,
		eccAmplitude,
		LAPSE_RATE,
		tidalTd,
		redistribution,
		contrast,
	}
}

/**
 * Applies simplex noise to break up smooth temperature isotherms.
 * `computeTaper(r, x, y, z)` returns a per-cell blend weight [0, 1].
 * `includeCell(r)` gates which cells are processed.
 * When avg/min/max arrays are provided they also receive the offset.
 */
function applyTemperatureNoise(
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

function recomputeAnnualTemperatureStats(
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

function maxPositiveValue(field?: Float32Array): number {
	if (!field) return 0
	let result = 0
	for (let i = 0; i < field.length; i++) {
		if (field[i] > result) result = field[i]
	}
	return result
}

function buildVolcanicSourceField(
	mesh: SphereMesh,
	hotspot?: Float32Array,
	mantleUpwelling?: Float32Array,
	terrainFeatures?: OrogenTerrainFeatures,
): Float32Array {
	const source = new Float32Array(mesh.numRegions)
	const hotspotMax = maxPositiveValue(hotspot)
	const mantleMax = maxPositiveValue(mantleUpwelling)
	const featureMask = terrainFeatures?.featureMask

	for (let r = 0; r < mesh.numRegions; r++) {
		let value = 0
		if (hotspotMax > 1e-6 && hotspot) {
			value += 0.7 * Math.sqrt(Math.max(0, hotspot[r]) / hotspotMax)
		}
		if (mantleMax > 1e-6 && mantleUpwelling) {
			value += 0.35 * Math.sqrt(Math.max(0, mantleUpwelling[r]) / mantleMax)
		}
		const mask = featureMask?.[r] ?? 0
		if ((mask & VOLCANIC_ARC_MASK) !== 0) value += 0.35
		if ((mask & LARGE_IGNEOUS_PROVINCE_MASK) !== 0) value += 0.25
		source[r] = Math.min(1.25, value)
	}

	return source
}

function diffuseVolcanicSource(
	mesh: SphereMesh,
	source: Float32Array,
	pressure: number,
): Float32Array {
	if (mesh.adjList.length === 0) return source.slice()

	const pressureLog = Math.log10(Math.max(pressure, 1e-3))
	const passes = Math.max(
		1,
		Math.min(5, 1 + Math.round(Math.max(0, pressureLog + 1))),
	)
	const neighborShare = 0.18 + 0.08 * Math.max(0, Math.min(3, pressureLog + 1))
	let current = source.slice()
	let next = new Float32Array(source.length)

	for (let pass = 0; pass < passes; pass++) {
		for (let r = 0; r < mesh.numRegions; r++) {
			const start = mesh.adjOffset[r]
			const end = mesh.adjOffset[r + 1]
			if (start === end) {
				next[r] = current[r]
				continue
			}
			let neighborSum = 0
			for (let i = start; i < end; i++) neighborSum += current[mesh.adjList[i]]
			const neighborAverage = neighborSum / (end - start)
			next[r] =
				current[r] * (1 - neighborShare) + neighborAverage * neighborShare
			if (next[r] < source[r] * 0.55) next[r] = source[r] * 0.55
		}
		;[current, next] = [next, current]
	}

	return current
}

interface VolcanicTemperatureEffectParams {
	mesh: SphereMesh
	params: OrogenParams
	temperature_monthly: Float32Array
	temperature_monthly_nolapse: Float32Array
	hotspot?: Float32Array
	mantleUpwelling?: Float32Array
	terrainFeatures?: OrogenTerrainFeatures
}

function applyVolcanicTemperatureEffects({
	mesh,
	params,
	temperature_monthly,
	temperature_monthly_nolapse,
	hotspot,
	mantleUpwelling,
	terrainFeatures,
}: VolcanicTemperatureEffectParams): void {
	const volcanism = clampVolcanism(params.volcanism, 1)
	if (volcanism <= 1) return

	const pressure = Math.max(params.pressure ?? 1.0, 1e-3)
	const activity = smoothstep01((volcanism - 1) / 9)
	if (activity <= 0) return

	const overdrive = getVolcanismOverdrive(volcanism)
	const localSource = buildVolcanicSourceField(
		mesh,
		hotspot,
		mantleUpwelling,
		terrainFeatures,
	)
	const diffusedSource = diffuseVolcanicSource(mesh, localSource, pressure)
	const pressureLog = Math.log10(pressure)
	const retentionFactor = 0.35 + 0.65 * smoothstep01((pressureLog + 1) / 3)
	const localCoupling = 0.95 + 0.45 * smoothstep01((pressureLog + 1) / 3)
	const localPeakDelta = activity * localCoupling * (7.5 + 10 * overdrive)
	const greenhousePressureBoost =
		retentionFactor *
		(1 +
			0.35 * Math.max(0, pressureLog) +
			0.12 * Math.max(0, pressureLog) * Math.max(0, pressureLog))
	const globalGreenhouseDelta =
		activity * greenhousePressureBoost * (1.8 + 18 * Math.pow(overdrive, 1.08))

	for (let r = 0; r < mesh.numRegions; r++) {
		const geothermalDelta =
			localPeakDelta *
			Math.min(1.5, 0.5 * localSource[r] + 0.75 * diffusedSource[r])
		const totalDelta = globalGreenhouseDelta + geothermalDelta
		if (Math.abs(totalDelta) <= 1e-6) continue
		for (let month = 0; month < 12; month++) {
			const idx = month * mesh.numRegions + r
			temperature_monthly[idx] += totalDelta
			temperature_monthly_nolapse[idx] += totalDelta
		}
	}
}

/**
 * Compute per-cell temperature for a tidally locked planet using a
 * Legendre polynomial expansion around the substellar point.
 *
 * T(θ) = T_mean + A₁·P₁(cosθ) + A₂·P₂(cosθ)
 *
 * where θ is angular distance from the substellar point. Redistribution
 * factor controls how uniform temperatures are (1 = perfectly uniform,
 * 0 = no heat redistribution).
 */
function computeTidalTemperature(
	mesh: SphereMesh,
	elevation: Float32Array,
	landFraction: number[],
	params: OrogenParams,
	oceanDist?: Float32Array,
	elevation_km?: Float32Array,
	hotspot?: Float32Array,
	mantleUpwelling?: Float32Array,
	terrainFeatures?: OrogenTerrainFeatures,
): OrogenClimate {
	const N = mesh.numRegions
	const sub = getSubstellarDir(params.antistellarLon)
	const daylight_hours_monthly = computeMonthlyDaylightHours(mesh, params)

	const { T_mean_C, A1, A_night, eccAmplitude, LAPSE_RATE, tidalTd, contrast } =
		computeTidalTransportParams(params)
	const KM_TO_MI = 0.621371

	const temperature_avg = new Float32Array(N)
	const temperature_min = new Float32Array(N)
	const temperature_max = new Float32Array(N)
	const temperature_monthly = new Float32Array(N * 12)
	const temperature_monthly_nolapse = new Float32Array(N * 12)
	const temperature_monthly_range = new Float32Array(N * 12)
	const insolation_monthly = new Float32Array(N * 12)
	const pet_monthly = new Float32Array(N * 12)

	const monthlyFlux = computeMonthlyOrbitalFlux(params)

	for (let r = 0; r < N; r++) {
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]

		// Angular distance from substellar point
		const cosTheta = Math.max(
			-1,
			Math.min(1, x * sub[0] + y * sub[1] + z * sub[2]),
		)

		const P1 = cosTheta
		const nightFrac = (1 - cosTheta) / 2 // 0 at substellar, 1 at antistellar

		let T = T_mean_C + A1 * P1 + A_night * nightFrac

		// Lapse rate correction for elevated terrain
		const hKm = elevation_km ? elevation_km[r] : elevToHeightKm(elevation[r])
		const lapseCorrection = hKm > 0 ? hKm * LAPSE_RATE : 0
		T -= lapseCorrection

		// Continentality moderation — inland areas have slightly more extreme temps
		// For tidal lock the effect is small since there are no seasons, but
		// ocean proximity still moderates the base temperature slightly
		if (oceanDist) {
			const distMiles = oceanDist[r] * KM_TO_MI
			// Inland areas are slightly warmer on dayside, slightly colder on nightside
			const inlandShift = Math.tanh((distMiles - 300) / 1000) * 2 * contrast
			T += cosTheta > 0 ? inlandShift : -inlandShift
		}

		// All 12 monthly slots get the same value (tiny eccentricity wobble spread as sine)
		for (let month = 0; month < 12; month++) {
			const phase = Math.sin((month / 12) * 2 * Math.PI)
			const monthValue = T + eccAmplitude * phase
			temperature_monthly[month * N + r] = monthValue
			temperature_monthly_nolapse[month * N + r] = monthValue + lapseCorrection
			temperature_monthly_range[month * N + r] = tidalTd
			insolation_monthly[month * N + r] =
				monthlyFlux[month] * Math.max(0, cosTheta)
		}
	}

	// Temperature noise: break up perfectly smooth concentric isotherms.
	// Amplitude tapers near the substellar point and deep nightside.
	applyTemperatureNoise(
		mesh,
		N,
		params.seed ?? 0,
		temperature_monthly,
		temperature_monthly_nolapse,
		(_r, x, y, z) => {
			const ct = Math.max(-1, Math.min(1, x * sub[0] + y * sub[1] + z * sub[2]))
			// fade near substellar (ct > 0.5) and deep nightside (ct < -0.5)
			return Math.min(
				1 - Math.max(0, ct - 0.5) * 2,
				1 + Math.min(0, ct + 0.5) * 2,
			)
		},
		() => true,
	)
	applyVolcanicTemperatureEffects({
		mesh,
		params,
		temperature_monthly,
		temperature_monthly_nolapse,
		hotspot,
		mantleUpwelling,
		terrainFeatures,
	})

	const insolationMul = params.insolationFactor ?? 1
	for (let i = 0; i < insolation_monthly.length; i++) {
		insolation_monthly[i] *= insolationMul
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
	hotspot?: Float32Array,
	mantleUpwelling?: Float32Array,
	terrainFeatures?: OrogenTerrainFeatures,
): OrogenClimate {
	if (params.tidallyLocked) {
		return computeTidalTemperature(
			mesh,
			elevation,
			landFraction,
			params,
			oceanDist,
			elevation_km,
			hotspot,
			mantleUpwelling,
			terrainFeatures,
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
		const lapseCorrection = hKm > 0 ? hKm * LAPSE_RATE : 0

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
	applyVolcanicTemperatureEffects({
		mesh,
		params,
		temperature_monthly,
		temperature_monthly_nolapse,
		hotspot,
		mantleUpwelling,
		terrainFeatures,
	})

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

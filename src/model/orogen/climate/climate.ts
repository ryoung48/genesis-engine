/**
 * EBM temperature layer for the orogen pipeline.
 * Computes land fraction from mesh elevation, runs the energy balance model,
 * and maps zonal temperatures to per-cell with elevation lapse rate correction.
 */

import { EMB_CONSTANTS } from "../../cells/ebm/constants"
import { EnergyBalanceModel } from "../../cells/ebm/index"
import { INSOLATION } from "../../cells/ebm/insolation"
import { TIME } from "../../utilities/time"
import type { OrogenClimate, OrogenParams, SphereMesh } from "../types"
import { SimplexNoise } from "../util/simplex-noise"
import {
	getDaysPerYear,
	getEccentricity,
	getEffectiveObliquityDeg,
	getHoursPerDay,
	getPerihelion,
	getPlanetRadiusKm,
	getSubstellarDir,
	getSunTempFactor,
	isTidallyLocked,
} from "../util/units"
import { fillPetMonthlyHargreaves } from "./hydrology"

const NUM_LAT = EMB_CONSTANTS.grid.NUM_LAT // 36
const MONTH_DAY_COUNTS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const LAT_STEP_INV = (NUM_LAT - 1) / 180 // O(1) uniform-grid interpolation

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
	const landCount = new Float64Array(NUM_LAT)
	const totalCount = new Float64Array(NUM_LAT)

	for (let r = 0; r < mesh.numRegions; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
		// Map -90..90 to band index 0..35
		const band = Math.max(
			0,
			Math.min(NUM_LAT - 1, Math.floor(((latDeg + 90) / 180) * NUM_LAT)),
		)
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
	const effectiveTSun = T_SUN * getSunTempFactor(params.sunTempFactor)
	const s0 =
		(SIGMA * Math.pow(effectiveTSun, 4) * Math.pow(R_SUN, 2)) / Math.pow(AU, 2)
	const ecc = getEccentricity(params.eccentricity)
	const PI = Math.PI
	const perihelionRad = (getPerihelion(params.perihelion) * Math.PI) / 180
	const longP = perihelionRad + PI
	const equinoxOffsetRad = (40 * 2 * Math.PI) / EMB_CONSTANTS.time.DAYS_PER_YEAR

	const calcEccFromTrue = (
		trueAnomaly: number,
		eccentricity: number,
	): number => {
		if (trueAnomaly > PI) {
			return (
				2 * PI -
				Math.acos(
					(eccentricity + Math.cos(trueAnomaly)) /
						(1 + eccentricity * Math.cos(trueAnomaly)),
				)
			)
		}
		return Math.acos(
			(eccentricity + Math.cos(trueAnomaly)) /
				(1 + eccentricity * Math.cos(trueAnomaly)),
		)
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
			trueA =
				eccA > PI
					? 2 * PI -
						Math.acos((Math.cos(eccA) - ecc) / (1 - ecc * Math.cos(eccA)))
					: Math.acos((Math.cos(eccA) - ecc) / (1 - ecc * Math.cos(eccA)))
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

export function computeMonthlyInsolation(
	mesh: SphereMesh,
	params: OrogenParams,
): Float32Array {
	const N = mesh.numRegions
	const monthly = new Float32Array(N * 12)

	if (isTidallyLocked(params.tidallyLocked)) {
		const sub = getSubstellarDir(params.antistellarLon)
		const monthlyFlux = computeMonthlyOrbitalFlux(params)
		for (let r = 0; r < N; r++) {
			const x = mesh.r_xyz[3 * r]
			const y = mesh.r_xyz[3 * r + 1]
			const z = mesh.r_xyz[3 * r + 2]
			const cosTheta = Math.max(
				0,
				Math.min(1, x * sub[0] + y * sub[1] + z * sub[2]),
			)
			for (let month = 0; month < 12; month++) {
				monthly[month * N + r] = monthlyFlux[month] * cosTheta
			}
		}
		return monthly
	}

	const lats = Array.from(
		{ length: EMB_CONSTANTS.grid.NUM_LAT },
		(_, i) => -Math.PI / 2 + (Math.PI * i) / (EMB_CONSTANTS.grid.NUM_LAT - 1),
	)
	const { _insolation } = INSOLATION.compute(
		lats,
		{
			...EMB_CONSTANTS.orbital,
			OBLIQUITY: getEffectiveObliquityDeg(params.obliquity),
			ECCENTRICITY: getEccentricity(params.eccentricity),
			PERIHELION: getPerihelion(params.perihelion),
		},
		{
			...EMB_CONSTANTS.stellar,
			T_SUN:
				EMB_CONSTANTS.stellar.T_SUN * getSunTempFactor(params.sunTempFactor),
		},
	)
	const monthlyRanges: number[][] = new Array(12)
	for (let month = 0; month < 12; month++) {
		const days = TIME.month.days(month)
		monthlyRanges[month] = _insolation.map(
			(row) =>
				days.reduce((sum, day) => sum + row[day], 0) / Math.max(1, days.length),
		)
	}

	for (let r = 0; r < N; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
		for (let month = 0; month < 12; month++) {
			monthly[month * N + r] = interpolateLatBand(monthlyRanges[month], latDeg)
		}
	}

	return monthly
}

export function computeMonthlyDaylightHours(
	mesh: SphereMesh,
	params: OrogenParams,
): Float32Array {
	const N = mesh.numRegions
	const monthly = new Float32Array(N * 12)
	const hoursPerDay = getHoursPerDay(params.hoursPerDay)

	if (isTidallyLocked(params.tidallyLocked)) {
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
			ECCENTRICITY: getEccentricity(params.eccentricity),
			PERIHELION: getPerihelion(params.perihelion),
		},
		{
			...EMB_CONSTANTS.stellar,
			T_SUN:
				EMB_CONSTANTS.stellar.T_SUN * getSunTempFactor(params.sunTempFactor),
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
		const z = mesh.r_xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
		for (let month = 0; month < 12; month++) {
			monthly[month * N + r] = interpolateLatBand(monthlyRanges[month], latDeg)
		}
	}

	return monthly
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
): OrogenClimate {
	const N = mesh.numRegions
	const sub = getSubstellarDir(params.antistellarLon)
	const sunFactor = getSunTempFactor(params.sunTempFactor)
	const ecc = getEccentricity(params.eccentricity)
	const yearDays = getDaysPerYear(params.daysPerYear)
	const radiusM = getPlanetRadiusKm(params.planetRadiusKm) * 1000
	const pressure = params.pressure ?? 1.0
	const daylight_hours_monthly = computeMonthlyDaylightHours(mesh, params)

	// Solar constant: S₀ = σ·T⁴·R²/AU²
	const { SIGMA, T_SUN, R_SUN, AU } = EMB_CONSTANTS.stellar
	const effectiveTSun = T_SUN * sunFactor
	const S0 =
		(SIGMA * Math.pow(effectiveTSun, 4) * Math.pow(R_SUN, 2)) / Math.pow(AU, 2)
	const albedo = 0.3 // Earth-like bond albedo

	// Radiative equilibrium temperature (no greenhouse): ~255K for Earth
	const T_eq = Math.pow((S0 * (1 - albedo)) / (4 * SIGMA), 0.25)
	// Add greenhouse warming — ~33°C for Earth-like atmosphere
	const GREENHOUSE_OFFSET = 33
	const T_mean_C = T_eq - 273.15 + GREENHOUSE_OFFSET

	// Mirror the EBM heat transport scaling so larger/slower/denser worlds
	// redistribute heat more efficiently, while smaller/faster/thinner worlds
	// keep stronger day-night contrasts.
	const radiusRatio = EMB_CONSTANTS.planet.EARTH_RADIUS / radiusM
	const radiusFactor = radiusRatio * radiusRatio
	const pressureFactor = Math.pow(pressure, 0.5)
	const yearFactor = Math.pow(yearDays / EMB_CONSTANTS.time.DAYS_PER_YEAR, 0.25)
	const transportFactor = radiusFactor * pressureFactor * yearFactor

	// Redistribution factor: 1.0 = perfectly uniform, 0.0 = no redistribution
	// Earth-like defaults to 0.5 and varies smoothly with the same factors as EBM D.
	const redistribution = Math.max(
		0.2,
		Math.min(0.85, 0.5 + 0.18 * Math.tanh((transportFactor - 1) * 1.5)),
	)
	const contrast = 1 - redistribution

	// Legendre coefficients:
	//   A₁·P₁ = hemisphere contrast (dayside warm, nightside cold)
	//   A₂·P₂ = peak shape — NEGATIVE so it depresses the antistellar point
	//           (P₂(1)=P₂(-1)=1, so positive A₂ would warm both poles equally)
	const A1 = 60 * contrast // 30°C hemisphere contrast
	const A2 = -20 * contrast // -10°C: cools antistellar, warms terminator slightly

	// Eccentricity-driven global oscillation amplitude (small)
	const eccAmplitude = ecc * 8 // up to ~1.6°C for ecc=0.2

	const gravityRatio = getPlanetRadiusKm(params.planetRadiusKm) / 6371
	const LAPSE_RATE = 6.5 * gravityRatio // °C per km, scaled by surface gravity
	const KM_TO_MI = 0.621371

	const temperature_avg = new Float32Array(N)
	const temperature_min = new Float32Array(N)
	const temperature_max = new Float32Array(N)
	const temperature_monthly = new Float32Array(N * 12)
	const temperature_monthly_nolapse = new Float32Array(N * 12)
	const temperature_monthly_range = new Float32Array(N * 12)
	const insolation_monthly = new Float32Array(N * 12)
	const pet_monthly = new Float32Array(N * 12)

	// Tidal locked: no seasons, so within-month temp range ≈ eccentricity amplitude.
	// Use a floor of 5°C so Hargreaves PET stays non-zero on near-circular orbits.
	const tidalTd = Math.max(5, 2 * eccAmplitude)
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

		// Legendre polynomials
		const P1 = cosTheta
		const P2 = (3 * cosTheta * cosTheta - 1) / 2

		let T = T_mean_C + A1 * P1 + A2 * P2

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
	// Two octaves of simplex noise on the unit sphere, applied to all cells.
	// Amplitude tapers near the substellar point (convection keeps it uniform)
	// and on the deep nightside (radiative cooling dominates).
	{
		const seed = params.seed ?? 0
		const sn1 = new SimplexNoise(seed + 3001)
		const sn2 = new SimplexNoise(seed + 3002)
		const FREQ1 = 3.0 // broad swirls
		const FREQ2 = 7.0 // smaller eddies
		const AMP1 = 3.0 // °C
		const AMP2 = 1.2 // °C

		for (let r = 0; r < N; r++) {
			const x = mesh.r_xyz[3 * r]
			const y = mesh.r_xyz[3 * r + 1]
			const z = mesh.r_xyz[3 * r + 2]

			// cosTheta from substellar: 1 at substellar, -1 at antistellar
			const ct = Math.max(-1, Math.min(1, x * sub[0] + y * sub[1] + z * sub[2]))
			// Taper: strongest in the mid-dayside and terminator zone (~30-120°),
			// weaker at the substellar peak and deep nightside
			const taper = Math.min(
				1 - Math.max(0, ct - 0.5) * 2, // fade near substellar (ct > 0.5 → θ < 60°)
				1 + Math.min(0, ct + 0.5) * 2, // fade on deep nightside (ct < -0.5 → θ > 120°)
			)

			const n =
				sn1.noise3D(x * FREQ1, y * FREQ1, z * FREQ1) * AMP1 +
				sn2.noise3D(x * FREQ2, y * FREQ2, z * FREQ2) * AMP2
			const offset = n * Math.max(0, taper)

			for (let month = 0; month < 12; month++) {
				temperature_monthly[month * N + r] += offset
				temperature_monthly_nolapse[month * N + r] += offset
			}
		}
	}

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

	fillPetMonthlyHargreaves(
		temperature_monthly,
		temperature_monthly_range,
		insolation_monthly,
		pet_monthly,
		getDaysPerYear(params.daysPerYear) / 12,
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
	if (isTidallyLocked(params.tidallyLocked)) {
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
			ECCENTRICITY: getEccentricity(params.eccentricity),
			PERIHELION: getPerihelion(params.perihelion),
		},
		stellar: {
			...EMB_CONSTANTS.stellar,
			T_SUN:
				EMB_CONSTANTS.stellar.T_SUN * getSunTempFactor(params.sunTempFactor),
		},
		time: {
			YEAR_LENGTH_DAYS: getDaysPerYear(params.daysPerYear),
			HOURS_PER_DAY: getHoursPerDay(params.hoursPerDay),
		},
		pressure: params.pressure ?? 1.0,
		radius: getPlanetRadiusKm(params.planetRadiusKm) * 1000,
		landFraction,
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

	const gravityRatio = getPlanetRadiusKm(params.planetRadiusKm) / 6371
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
	// Two octaves of simplex noise on the unit sphere, applied only to
	// ocean cells. Amplitude tapers toward the equator (tropics are more
	// uniform) and toward the poles (already cold-clamped).
	if (isLand) {
		const seed = params.seed ?? 0
		const sn1 = new SimplexNoise(seed + 3001)
		const sn2 = new SimplexNoise(seed + 3002)
		const FREQ1 = 3.0 // broad swirls
		const FREQ2 = 7.0 // smaller eddies
		const AMP1 = 3.0 // °C
		const AMP2 = 1.2 // °C

		for (let r = 0; r < N; r++) {
			if (isLand[r]) continue
			const x = mesh.r_xyz[3 * r]
			const y = mesh.r_xyz[3 * r + 1]
			const z = mesh.r_xyz[3 * r + 2]

			// Latitude taper: strongest at mid-latitudes (~30-60°), weaker at equator and poles
			const absZ = Math.abs(z) // sin(lat) on unit sphere
			const taper = Math.min(1, absZ / 0.35) // full above ~20°, fades to zero at equator

			const n =
				sn1.noise3D(x * FREQ1, y * FREQ1, z * FREQ1) * AMP1 +
				sn2.noise3D(x * FREQ2, y * FREQ2, z * FREQ2) * AMP2
			const offset = n * taper

			temperature_avg[r] += offset
			temperature_min[r] += offset
			temperature_max[r] += offset
			for (let month = 0; month < 12; month++) {
				temperature_monthly[month * N + r] += offset
				temperature_monthly_nolapse[month * N + r] += offset
			}
		}
	}

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

	fillPetMonthlyHargreaves(
		temperature_monthly,
		temperature_monthly_range,
		insolation_monthly,
		pet_monthly,
		getDaysPerYear(params.daysPerYear) / 12,
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

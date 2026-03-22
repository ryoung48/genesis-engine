/**
 * EBM temperature layer for the orogen pipeline.
 * Computes land fraction from mesh elevation, runs the energy balance model,
 * and maps zonal temperatures to per-cell with elevation lapse rate correction.
 */
import * as d3 from "d3"

import { EnergyBalanceModel } from "../cells/ebm/index"
import { EMB_CONSTANTS } from "../cells/ebm/constants"
import type { SphereMesh, OrogenParams, OrogenClimate } from "./types"
import { getDaysPerYear, getEffectiveObliquityDeg, getEccentricity, getHoursPerDay, getSunTempFactor, isTidallyLocked } from "./units"

const NUM_LAT = EMB_CONSTANTS.grid.NUM_LAT // 36
const MONTH_DAY_COUNTS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Convert raw mesh elevation to physical height in km (inlined from colors.ts) */
export function elevToHeightKm(elev: number): number {
	if (elev <= 0) return elev * 10
	const t = Math.min(elev, 1)
	const t2 = t * t
	return 6 * t2 * t2 * (5 - 4 * t)
}

/** Bin regions into 36 latitude bands, count land fraction per band. */
export function computeLandFraction(mesh: SphereMesh, isLand: Uint8Array): number[] {
	const landCount = new Float64Array(NUM_LAT)
	const totalCount = new Float64Array(NUM_LAT)

	for (let r = 0; r < mesh.numRegions; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
		// Map -90..90 to band index 0..35
		const band = Math.max(0, Math.min(NUM_LAT - 1,
			Math.floor((latDeg + 90) / 180 * NUM_LAT)))
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

/** Substellar point direction — lon=0, lat=0 on a unit sphere */
const SUBSTELLAR: [number, number, number] = [1, 0, 0]

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
): OrogenClimate {
	const N = mesh.numRegions
	const sunFactor = getSunTempFactor(params.sunTempFactor)
	const ecc = getEccentricity(params.eccentricity)

	// Solar constant: S₀ = σ·T⁴·R²/AU²
	const { SIGMA, T_SUN, R_SUN, AU } = EMB_CONSTANTS.stellar
	const effectiveTSun = T_SUN * sunFactor
	const S0 = SIGMA * Math.pow(effectiveTSun, 4) * Math.pow(R_SUN, 2) / Math.pow(AU, 2)
	const albedo = 0.3 // Earth-like bond albedo

	// Radiative equilibrium temperature (no greenhouse): ~255K for Earth
	const T_eq = Math.pow((S0 * (1 - albedo)) / (4 * SIGMA), 0.25)
	// Add greenhouse warming — ~33°C for Earth-like atmosphere
	const GREENHOUSE_OFFSET = 33
	const T_mean_C = T_eq - 273.15 + GREENHOUSE_OFFSET

	// Redistribution factor: 1.0 = perfectly uniform, 0.0 = no redistribution
	// 0.5 = moderate atmosphere (Earth-like for tidally locked M-dwarf HZ)
	const redistribution = 0.5
	const contrast = 1 - redistribution

	// Legendre coefficients:
	//   A₁·P₁ = hemisphere contrast (dayside warm, nightside cold)
	//   A₂·P₂ = peak shape — NEGATIVE so it depresses the antistellar point
	//           (P₂(1)=P₂(-1)=1, so positive A₂ would warm both poles equally)
	const A1 = 60 * contrast  // 30°C hemisphere contrast
	const A2 = -20 * contrast // -10°C: cools antistellar, warms terminator slightly

	// Eccentricity-driven global oscillation amplitude (small)
	const eccAmplitude = ecc * 8 // up to ~1.6°C for ecc=0.2

	const LAPSE_RATE = 6.5 // °C per km
	const KM_TO_MI = 0.621371

	const temperature_avg = new Float32Array(N)
	const temperature_min = new Float32Array(N)
	const temperature_max = new Float32Array(N)
	const temperature_monthly = new Float32Array(N * 12)

	for (let r = 0; r < N; r++) {
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]

		// Angular distance from substellar point
		const cosTheta = Math.max(-1, Math.min(1,
			x * SUBSTELLAR[0] + y * SUBSTELLAR[1] + z * SUBSTELLAR[2]))

		// Legendre polynomials
		const P1 = cosTheta
		const P2 = (3 * cosTheta * cosTheta - 1) / 2

		let T = T_mean_C + A1 * P1 + A2 * P2

		// Lapse rate correction for elevated terrain
		const lapseCorrection = elevation[r] > 0 ? elevToHeightKm(elevation[r]) * LAPSE_RATE : 0
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

		temperature_avg[r] = T

		// No seasons — min/max differ only by eccentricity oscillation
		temperature_min[r] = T - eccAmplitude
		temperature_max[r] = T + eccAmplitude

		// All 12 monthly slots get the same value (tiny eccentricity wobble spread as sine)
		for (let month = 0; month < 12; month++) {
			const phase = Math.sin((month / 12) * 2 * Math.PI)
			temperature_monthly[month * N + r] = T + eccAmplitude * phase
		}
	}

	return {
		temperature_avg,
		temperature_min,
		temperature_max,
		temperature_monthly,
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
): OrogenClimate {
	if (isTidallyLocked(params.tidallyLocked)) {
		return computeTidalTemperature(mesh, elevation, landFraction, params, oceanDist)
	}

	const ebm = new EnergyBalanceModel({
		orbital: {
			OBLIQUITY: getEffectiveObliquityDeg(params.obliquity),
			ECCENTRICITY: getEccentricity(params.eccentricity),
			PERIHELION: 90,
		},
		stellar: {
			...EMB_CONSTANTS.stellar,
			T_SUN: EMB_CONSTANTS.stellar.T_SUN * getSunTempFactor(params.sunTempFactor),
		},
		time: {
			YEAR_LENGTH_DAYS: getDaysPerYear(params.daysPerYear),
			HOURS_PER_DAY: getHoursPerDay(params.hoursPerDay),
		},
		landFraction,
	})
	ebm.runModel(30, 0.5)

	// Build interpolation scales: latitude degrees → zonal temperature
	const scaleAvg = d3.scaleLinear().domain(ebm.lats_deg).range(ebm.temperature_avg)
	const scaleMin = d3.scaleLinear().domain(ebm.lats_deg).range(ebm.temperature_min)
	const scaleMax = d3.scaleLinear().domain(ebm.lats_deg).range(ebm.temperature_max)
	let dayStart = 0
	const scaleMonthly = MONTH_DAY_COUNTS.map((days) => {
		const start = dayStart
		const end = start + days
		dayStart = end
		return d3.scaleLinear().domain(ebm.lats_deg).range(
			ebm.temperature.map((row) => (d3.mean(row.slice(start, end)) ?? 0)),
		)
	})

	const N = mesh.numRegions
	const temperature_avg = new Float32Array(N)
	const temperature_min = new Float32Array(N)
	const temperature_max = new Float32Array(N)
	const temperature_monthly = new Float32Array(N * 12)

	const LAPSE_RATE = 6.5 // °C per km

	// Convert ocean distance from km to miles for continentality model
	const KM_TO_MI = 0.621371

	for (let r = 0; r < N; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
		const lapseCorrection = elevation[r] > 0 ? elevToHeightKm(elevation[r]) * LAPSE_RATE : 0

		const annualAvg = (scaleAvg(latDeg) as number) - lapseCorrection
		temperature_avg[r] = annualAvg

		// Continentality: scale seasonal deviation from annual mean
		// Ocean (0 mi): factor ≈ 0.78 (damped), coast (~300 mi): factor ≈ 1.0, deep inland: → 1.75
		// Taper toward poles: less solar energy = lower ceiling for continental amplification
		const distMiles = oceanDist ? oceanDist[r] * KM_TO_MI : 0
		const absLat = Math.abs(latDeg)
		const polarTaper = absLat > 55 ? 1 - (absLat - 55) / 35 : 1 // linear fade 55°–90°
		const maxAmplitude = 0.75 * Math.max(0, polarTaper)
		const inertiaFactor = oceanDist ? 1 + maxAmplitude * Math.tanh((distMiles - 300) / 1000) : 1

		const zonalMin = (scaleMin(latDeg) as number) - lapseCorrection
		const zonalMax = (scaleMax(latDeg) as number) - lapseCorrection
		temperature_min[r] = annualAvg + (zonalMin - annualAvg) * inertiaFactor
		temperature_max[r] = annualAvg + (zonalMax - annualAvg) * inertiaFactor

		for (let month = 0; month < 12; month++) {
			const zonalMonth = (scaleMonthly[month](latDeg) as number) - lapseCorrection
			temperature_monthly[month * N + r] =
				annualAvg + (zonalMonth - annualAvg) * inertiaFactor
		}
	}

	return {
		temperature_avg,
		temperature_min,
		temperature_max,
		temperature_monthly,
		landFraction,
	}
}

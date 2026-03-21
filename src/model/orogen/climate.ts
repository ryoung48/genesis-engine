/**
 * EBM temperature layer for the orogen pipeline.
 * Computes land fraction from mesh elevation, runs the energy balance model,
 * and maps zonal temperatures to per-cell with elevation lapse rate correction.
 */
import * as d3 from "d3"

import { EnergyBalanceModel } from "../cells/ebm/index"
import { EMB_CONSTANTS } from "../cells/ebm/constants"
import type { SphereMesh, OrogenParams, OrogenClimate } from "./types"

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
export function computeLandFraction(mesh: SphereMesh, elevation: Float32Array): number[] {
	const landCount = new Float64Array(NUM_LAT)
	const totalCount = new Float64Array(NUM_LAT)

	for (let r = 0; r < mesh.numRegions; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		const latDeg = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)
		// Map -90..90 to band index 0..35
		const band = Math.max(0, Math.min(NUM_LAT - 1,
			Math.floor((latDeg + 90) / 180 * NUM_LAT)))
		totalCount[band]++
		if (elevation[r] > 0) landCount[band]++
	}

	const landFraction: number[] = new Array(NUM_LAT)
	for (let i = 0; i < NUM_LAT; i++) {
		const frac = totalCount[i] > 0 ? landCount[i] / totalCount[i] : 0
		landFraction[i] = Math.min(frac, 0.8) // cap at 0.8 matching existing EBM
	}
	return landFraction
}

/** Run EBM and map zonal temperatures to per-cell with lapse rate + continentality correction. */
export function computeTemperature(
	mesh: SphereMesh,
	elevation: Float32Array,
	landFraction: number[],
	params: OrogenParams,
	oceanDist?: Float32Array,
): OrogenClimate {
	const ebm = new EnergyBalanceModel({
		orbital: {
			OBLIQUITY: params.obliquity ?? 23.5,
			ECCENTRICITY: params.eccentricity ?? 0,
			PERIHELION: 90,
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

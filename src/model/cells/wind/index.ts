/**
 * Wind estimation based on three-cell atmospheric circulation.
 *
 * Two modes:
 *  1. `calculateEbmWind` — zonal-mean signed wind from EBM lat×day grids (preview).
 *  2. `assignMonthly` / `build` — per-cell monthly wind speed using each cell's
 *     temperature, vegetation roughness, topography, and ocean distance.
 *
 * The Ekman-balanced core is shared: |V| = R·dT/dy / √(f² + k²), modulated
 * by the three-cell zonal profile. Cell-level factors then scale the result:
 *   - vegetation → surface roughness drag
 *   - topography → sheltering or funnelling
 *   - ocean distance → coastal exposure boost
 *
 * Returns signed zonal wind: negative = easterly, positive = westerly.
 */
import * as d3 from "d3"
import { interpolateBlues, interpolateReds, mean, range, scaleLinear } from "d3"

import { WORLD } from "../.."
import { TIME } from "../../utilities/time"
import { CELL } from "../"
import { EBM } from "../ebm"
import { RAIN } from "../rain"
import { Cell, Vegetation } from "../types"

/**
 * Signed zonal wind profile as a function of degrees from the thermal equator.
 * Negative = easterly, positive = westerly.
 *
 * Zone alignment with rain model:
 *   0–28°  ITCZ / Hadley trades  (easterly)
 *  20–40°  Subsidence belt        (weak, transition)
 *  40–90°  Ferrel westerlies      (westerly)
 *  65–90°  Polar cell             (easterly)
 */
const zonalProfile = scaleLinear()
	.domain([0, 15, 28, 35, 45, 60, 75, 90, 120, 150, 180])
	.range([-0.5, -0.6, -0.2, 0.2, 1.4, 0.4, -0.4, -0.5, -0.7, -0.5, -0.3])
	.clamp(true)

// --- Cell-level modifiers ---

/** Surface roughness multiplier by vegetation type (lower = more drag). */
const roughness: Record<Vegetation, number> = {
	desert: 1.0,
	sparse: 0.9,
	grasslands: 0.8,
	woods: 0.65,
	forest: 0.55,
	jungle: 0.45,
}

/** Topography multiplier — sheltering vs exposure. */
const topoFactor: Record<string, number> = {
	coastal: 1.0,
	marsh: 0.9,
	flat: 1.0,
	hills: 0.75,
	plateau: 0.65,
	mountains: 0.5,
}

/** Inland friction decay from ocean-baseline wind (miles). */
const coastalExposure = scaleLinear()
	.domain([0, 100, 500, 1500])
	.range([1.0, 0.9, 0.85, 0.75])
	.clamp(true)

// --- Physics Constants ---
const R_PLANET = 6.371e6 // meters
const R_AIR = 287 // J/kg·K
const OMEGA = (2 * Math.PI) / (24 * 3600) // rad/s
const K_FRICTION = 0.75e-4 // s⁻¹
const DEG = 180 / Math.PI
const RAD = Math.PI / 180

/** Calculate Ekman magnitude given a temperature grid and latitude array (radians). */
const getEkmanMagnitude = (
	tempGrid: number[][],
	latsRad: number[],
	i: number,
	day: number,
): number => {
	const numLat = latsRad.length
	let dT: number, dy: number
	if (i === 0) {
		dT = tempGrid[i + 1][day] - tempGrid[i][day]
		dy = R_PLANET * (latsRad[i + 1] - latsRad[i])
	} else if (i === numLat - 1) {
		dT = tempGrid[i][day] - tempGrid[i - 1][day]
		dy = R_PLANET * (latsRad[i] - latsRad[i - 1])
	} else {
		dT = tempGrid[i + 1][day] - tempGrid[i - 1][day]
		dy = R_PLANET * (latsRad[i + 1] - latsRad[i - 1])
	}
	const gradT = Math.abs(dT / dy)
	const f = Math.abs(2 * OMEGA * Math.sin(latsRad[i]))
	return (R_AIR * gradT) / Math.sqrt(f * f + K_FRICTION * K_FRICTION)
}

/** Calculate zonal profile multiplier based on latitude and thermal equator (degrees). */
const getProfileMultiplier = (latDeg: number, teqDeg: number): number => {
	const dist = Math.abs(latDeg - teqDeg)
	const teqDisplacement = Math.abs(teqDeg) / 90
	const profileWeight = 1 - 0.7 * teqDisplacement
	const rawProfile = zonalProfile(dist) as unknown as number
	const direction = Math.sign(rawProfile) || -1
	return profileWeight * rawProfile + (1 - profileWeight) * direction
}

/** Compute unsigned Ekman wind magnitude [lat][day] from the EBM heat grid. */
const _ekmanMagnitude = (): number[][] => {
	const ebm = EBM.model
	const numDays = EBM.constants.time.DAYS_PER_YEAR
	const latsRad = ebm.lats.map((d) => d * RAD)
	const numLat = latsRad.length

	const mag: number[][] = new Array(numLat)
		.fill(0)
		.map(() => new Array(numDays).fill(0))

	for (let day = 0; day < numDays; day++) {
		for (let i = 0; i < numLat; i++) {
			mag[i][day] = getEkmanMagnitude(ebm.heat, latsRad, i, day)
		}
	}
	return mag
}

export const WIND = {
	zones: { zonalProfile },

	/**
	 * Signed wind color: red = easterly, blue = westerly.
	 * `absMax` sets the scale ceiling (defaults to 15 m/s).
	 */
	color: (val: number, absMax = 15) => {
		const t = Math.min(Math.abs(val) / absMax, 1) * 0.85 + 0.15
		return val < 0 ? interpolateReds(t) : interpolateBlues(t)
	},

	/**
	 * Calculate signed zonal wind for EBM model (preview / visualization).
	 * @param temperature  [lat][day] in °C (gradient is unit-agnostic)
	 * @param latsRad      latitude array in radians
	 * @param teqByDay     thermal-equator latitude per day in degrees
	 * @returns            [lat][day] signed wind in m/s (neg=easterly, pos=westerly)
	 */
	calculateEbmWind: (
		temperature: number[][],
		latsRad: number[],
		teqByDay: number[],
	) => {
		const numLat = latsRad.length
		const numDays = temperature[0].length

		const wind: number[][] = new Array(numLat)
			.fill(0)
			.map(() => new Array(numDays).fill(0))

		for (let day = 0; day < numDays; day++) {
			const teqDeg = teqByDay[day]
			for (let i = 0; i < numLat; i++) {
				const magnitude = getEkmanMagnitude(temperature, latsRad, i, day)
				const profile = getProfileMultiplier(latsRad[i] * DEG, teqDeg)
				wind[i][day] = magnitude * profile
			}
		}
		return wind
	},

	/**
	 * Assign monthly signed zonal wind (m/s) to each cell.
	 * Ekman magnitude comes from the EBM temperature gradient; the zonal
	 * profile (trades vs westerlies) is offset by RAIN's longitude-varying
	 * thermal equator so wind zones track the same TEQ as precipitation.
	 */
	assignMonthly: (cells: Cell[]) => {
		const ebm = EBM.model

		// 1. Monthly-averaged Ekman magnitude by latitude
		const mag2d = _ekmanMagnitude()
		const monthlyEkman = range(12).map((month) => {
			const days = TIME.month.days(month)
			const avgByLat = ebm.lats.map((_, i) =>
				mean(days.map((d) => mag2d[i][d])),
			)
			return d3.scaleLinear().domain(ebm.lats).range(avgByLat).clamp(true)
		})

		// 2. Longitude-varying TEQ from rain model
		const teqCache = RAIN.teqCache()
		const lonBinWidth = 10
		const cellTeq = (cell: Cell, month: number): number => {
			const bin = Math.round(cell.x / lonBinWidth) * lonBinWidth
			return teqCache.get(bin)?.[month] ?? 0
		}

		// 3. Per-cell: Ekman magnitude × zonal profile (rain TEQ) × modifiers
		cells.forEach((cell) => {
			const veg = roughness[cell.vegetation] ?? 1.0
			const topo = topoFactor[cell.topography] ?? 1.0
			const coastal = coastalExposure(cell.oceanDist * window.world.cell.length)
			const mod = veg * topo * coastal

			const monthly = range(12).map((month) => {
				const magnitude = monthlyEkman[month](cell.y)
				const teq = cellTeq(cell, month)
				return magnitude * getProfileMultiplier(cell.y, teq) * mod
			})

			cell.wind = {
				monthly,
				annual: mean(monthly.map(Math.abs)),
			}
		})

		// Neighbor smoothing (2 passes)
		range(2).forEach(() => {
			cells.forEach((cell) => {
				const neighbors = CELL.neighbors(cell)
					.concat([cell])
					.filter((n) => n.wind?.monthly && !n.isWater)
				if (neighbors.length === 0) return
				cell.wind.monthly = range(12).map((month) => {
					const avg = mean(neighbors.map((n) => n.wind.monthly[month]))
					return avg ?? cell.wind.monthly[month]
				})
			})
		})

		// Recompute annual after smoothing
		cells.forEach((cell) => {
			cell.wind.annual = mean(cell.wind.monthly.map(Math.abs))
		})
	},

	/**
	 * Build wind data for all land cells (+ lakes).
	 * Should be called after rain (needs TEQ cache) and heat are assigned.
	 */
	build: () => {
		const cells = WORLD.cells.land()
		WIND.assignMonthly(cells)
	},
}

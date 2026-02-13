import { mean, scaleLinear } from "d3"

import { MATH } from "../../utilities/math"
import { TIME } from "../../utilities/time"
import { CELL } from "../"
import { EBM } from "../ebm"
import { RAIN } from "../rain"
import { Cell } from "../types"
import { DailyTemperatureParams, MonthlyTemperatureParams } from "./types"

const tempScale = scaleLinear<string>()
	.domain([
		-73, -51.11, -40, -28.89, -17.78, 0, 4.44, 10, 15.56, 21.11, 23.89, 26.67,
		29.44, 32.22, 35, 37.78, 40.56, 43.33, 46.11, 48.89, 80,
	])
	.range([
		"#f8fbff",
		"#dceefa",
		"#a3c2e6",
		"#8cb6d8",
		"#6495cd",
		"#2e5984",
		"#3b9ebf",
		"#6acdd8",
		"#9bd59f",
		"#d2e67f",
		"#f1e47e",
		"#f0c66f",
		"#f2a15e",
		"#f49b42",
		"#ef7d3b",
		"#e15c4f",
		"#d64964",
		"#ba2f6d",
		"#a31563",
		"#7d004f",
		"#5a002f",
	])
	.clamp(true)

const elevationCorrection = (km = 0, celsius = 0): number => {
	return celsius - km * 6.5
}

const calculateDTR = (cell: Cell, month: number, celsius: number) => {
	const DTR0 = 10
	const rotFactor = Math.sqrt(EBM.constants.time.HOURS_PER_DAY / 24)
	const miles = CELL.distMiles(cell)
	const km = MATH.conversion.distance.miles.km(miles)
	const oceanFactor = 1 + 0.8 * (1 - Math.exp(-km / 500))
	const rainFactor = Math.pow(
		100 / (RAIN.monthly.total({ cell, month }) + 10),
		0.3,
	)
	const dtr = DTR0 * rotFactor * oceanFactor * rainFactor
	const max = celsius + dtr / 2
	const min = celsius - dtr / 2
	return { max, min }
}

const _cache = {
	global: {
		mean: Infinity,
		max: -Infinity,
		min: Infinity,
	},
	/** Cached global TEQ per month (0-11), computed from EBM zonal scales only. */
	globalTEQ: null as { lat: number; temp: number }[] | null,
}

/** Compute global TEQ for all 12 months from EBM zonal heat scales (no cells needed). */
function computeGlobalTEQ(): { lat: number; temp: number }[] {
	const result: { lat: number; temp: number }[] = []
	for (let month = 0; month < 12; month++) {
		const days = TIME.month.days(month)
		let maxTemp = -Infinity
		let maxLat = 0
		// Scan latitudes from -90 to 90 in 1° steps
		for (let y = -90; y <= 90; y++) {
			let sum = 0
			for (const day of days) {
				sum += EBM.model.scales.heat.daily[day](y)
			}
			const avg = sum / days.length
			if (avg > maxTemp) {
				maxTemp = avg
				maxLat = y
			}
		}
		result.push({ lat: maxLat, temp: maxTemp })
	}
	return result
}

export const TEMPERATURE = {
	annual: {
		mean: (cell: Cell) =>
			elevationCorrection(cell.elevation, EBM.model.scales.heat.avg(cell.y)),
		max: (cell: Cell) =>
			elevationCorrection(cell.elevation, EBM.model.scales.heat.max(cell.y)),
		min: (cell: Cell) =>
			elevationCorrection(cell.elevation, EBM.model.scales.heat.min(cell.y)),
	},
	/** Global TEQ per month (0-11) from EBM zonal scales only (no cells). */
	globalTEQ: (month: number): { lat: number; temp: number } => {
		if (!_cache.globalTEQ) _cache.globalTEQ = computeGlobalTEQ()
		return _cache.globalTEQ[month]
	},
	global: {
		mean: () => {
			if (_cache.global.mean !== Infinity) return _cache.global.mean
			_cache.global.mean =
				mean(window.world.cells.map((c) => c.heat?.mean)) ?? 15
			return _cache.global.mean
		},
		max: () => {
			if (_cache.global.max !== -Infinity) return _cache.global.max
			_cache.global.max = Math.max(
				...window.world.cells.map((c) => c.heat?.max ?? -Infinity),
			)
			return _cache.global.max
		},
		min: () => {
			if (_cache.global.min !== Infinity) return _cache.global.min
			_cache.global.min = Math.min(
				...window.world.cells.map((c) => c.heat?.min ?? Infinity),
			)
			return _cache.global.min
		},
	},
	color: (celsius: number): string => tempScale(celsius),
	daily: {
		mean: ({ cell, day }: DailyTemperatureParams): number => {
			const zonalAvgCelsius = EBM.model.scales.heat.daily[day](cell.y)
			const annualAvgCelsius = EBM.model.scales.heat.avg(cell.y)

			// Continentality / Thermal Inertia
			// Land has low heat capacity (heats/cools fast), Ocean has high heat capacity (stable)
			const deviation = zonalAvgCelsius - annualAvgCelsius

			// Smooth transition based on mileage (scale over ~1000 miles)
			const distMiles =
				(cell.isWater ? -cell.landDist : cell.oceanDist) *
				window.world.cell.length
			const inertiaFactor = 0.5 + 1 * Math.tanh(distMiles / 1000)

			const localSeaLevelTemp = annualAvgCelsius + deviation * inertiaFactor

			return elevationCorrection(cell.elevation, localSeaLevelTemp)
		},
	},
	describe: (celsius: number): string => {
		const t = MATH.conversion.temperature.celsius.fahrenheit(celsius)
		if (t < -40) return "frozen"
		else if (t >= -40 && t < -30) return "glacial"
		else if (t >= -30 && t < -20) return "bitterly cold"
		else if (t >= -20 && t < -10) return "very cold"
		else if (t >= -10 && t < 0) return "cold"
		else if (t >= 0 && t < 10) return "wintry"
		else if (t >= 10 && t < 20) return "icy"
		else if (t >= 20 && t < 30) return "frosty"
		else if (t >= 30 && t < 40) return "chilly"
		else if (t >= 40 && t < 50) return "brisk"
		else if (t >= 50 && t < 60) return "cool"
		else if (t >= 60 && t < 70) return "mild"
		else if (t >= 70 && t < 80) return "warm"
		else if (t >= 80 && t < 90) return "balmy"
		else if (t >= 90 && t < 100) return "sweaty"
		else if (t >= 100 && t < 110) return "sweltering"
		else if (t >= 110 && t < 120) return "feverish"
		else if (t >= 120 && t < 130) return "baking"
		return "scorching"
	},
	/**
	 * Returns the latitude (°) and temperature of the thermal equator for a given month (0-11).
	 * Bins the provided cells by latitude and finds the peak
	 * mean temperature, giving a longitude-aware result.
	 */
	thermalEquator: (
		month: number,
		cells: Cell[],
	): { lat: number; temp: number } => {
		let maxTemp = -Infinity
		let maxLat = 0
		cells.forEach((c) => {
			const t =
				c.heat?.monthly?.[month] ?? TEMPERATURE.monthly.mean({ cell: c, month })
			if (t > maxTemp) {
				maxTemp = t
				maxLat = c.y
			}
		})
		return { lat: maxLat, temp: maxTemp }
	},
	monthly: {
		mean: ({ cell, month }: MonthlyTemperatureParams): number => {
			if (cell.heat?.monthly?.[month] === undefined) {
				cell.heat.monthly[month] = mean(
					TIME.month
						.days(month)
						.map((day) => TEMPERATURE.daily.mean({ cell, day })),
				)
			}
			return cell.heat.monthly[month]
		},
		/** Returns the minimum daily temperature for the month */
		min: ({ cell, month }: MonthlyTemperatureParams): number => {
			const days = TIME.month.days(month)
			const minTemp = Math.min(
				...days.map((day) => {
					const meanTemp = TEMPERATURE.daily.mean({ cell, day })
					const { min } = calculateDTR(cell, month, meanTemp)
					return min
				}),
			)
			return minTemp
		},
		/** Returns the maximum daily temperature for the month */
		max: ({ cell, month }: MonthlyTemperatureParams): number => {
			const days = TIME.month.days(month)
			const maxTemp = Math.max(
				...days.map((day) => {
					const meanTemp = TEMPERATURE.daily.mean({ cell, day })
					const { max } = calculateDTR(cell, month, meanTemp)
					return max
				}),
			)
			return maxTemp
		},
		range: (params: MonthlyTemperatureParams) => {
			const { cell, month } = params
			const mean = TEMPERATURE.monthly.mean({ cell, month })
			return calculateDTR(cell, month, mean)
		},
	},
}

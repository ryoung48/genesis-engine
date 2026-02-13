import { interpolateViridis, mean, range, scaleLinear } from "d3"

import { MATH } from "../../utilities/math"
import { TEMPERATURE } from "../temperature"
import { CELL } from "../"
import { Cell } from "../types"
import { GetMonthlyRainParams } from "./types"

const thresholds = {
	monthly: {
		parched: 5,
		arid: 10,
		dry: 20,
		low: 40,
		moderate: 62,
		moist: 83,
		wet: 125,
		humid: 165,
		saturated: 250,
	},
	annual: {
		parched: 62.5,
		arid: 125,
		dry: 250,
		low: 500,
		moderate: 750,
		moist: 1000,
		wet: 1500,
		humid: 2000,
		saturated: 3000,
	},
	clouds: {
		dry: 0.05,
		low: 0.15,
		moderate: 0.25,
		wet: 0.4,
		humid: 0.8,
		saturated: 1.0,
	},
}

const rainChanceScale = scaleLinear(
	[0, 10, 25, 50, 100, 150, 200, 250].reverse(),
	[0.92, 0.8, 0.68, 0.54, 0.42, 0.3, 0.18, 0.06],
)

// --- Zone driver helpers ---

/** ITCZ convergence: peaks at TEQ, tapers by ~28° */
const itczScale = scaleLinear()
	.domain([0, 8, 18, 28])
	.range([1, 0.7, 0.2, 0])
	.clamp(true)

/** Subsidence suppression: peaks ~30° from TEQ */
const subsidenceScale = scaleLinear()
	.domain([20, 25, 30, 35, 40])
	.range([0, 0.5, 1, 0.5, 0])
	.clamp(true)

/** East coast storms — TEQ ± 35°: range [15, 55] */
const eastStormScale = scaleLinear()
	.domain([15, 35, 90])
	.range([0, 0.8, 1])
	.clamp(true)

/** Polar front — TEQ ± 50°: range [40, 60] */
const polarFrontScale = scaleLinear()
	.domain([40, 50, 90])
	.range([0, 1, 0.8])
	.clamp(true)

/**
 * Continuous temperature → mm ceiling scale.
 * Smoothly interpolates max possible monthly rainfall based on
 * air moisture capacity (Clausius-Clapeyron).
 */
const ceilingScale = scaleLinear()
	.domain([-14, -8, 2, 12, 18, 35])
	.range([40, 62, 83, 125, 165, 250])
	.clamp(true)

/**
 * Compute 6 zone drivers for a cell/month and return a 0-1 weight.
 * All zone offsets are relative to the local thermal equator.
 */
const computeWeight = (
	cellY: number,
	teq: number,
	east: number,
	west: number,
) => {
	const dist = Math.abs(cellY - teq)
	const moisture = Math.max(east, west)

	// 1. ITCZ — convergent uplift at TEQ
	const itcz = itczScale(dist) * moisture

	// 2. Subsidence suppression
	const suppression = 1 - subsidenceScale(dist)

	// 3. East coast storms
	const eastStorms = eastStormScale(dist) * east

	// 4. Polar front
	const polar = polarFrontScale(dist) * west

	return {
		w: Math.min(
			Math.max(itcz * suppression, eastStorms, polar),
			1,
		),
		itcz,
		suppression,
		eastStorms,
		polar,
		dist,
	}
}

/** Persisted TEQ cache: Map<lonBin, teqLat[12]>. Populated by assignMonthly. */
let _teqCache: Map<number, number[]> = new Map()

export const RAIN = {
	/** Returns the cached TEQ data (lonBin → latitude per month). */
	teqCache: () => _teqCache,
	annual: {
		color: (mm: number) => interpolateViridis(RAIN.annual.scale(mm)),
		scale: scaleLinear(
			Object.values(thresholds.annual).reverse(),
			MATH.scaleDiscrete(Object.keys(thresholds.annual).length),
		),
		total: (cell: Cell) => cell.rain.monthly.reduce((sum, mm) => sum + mm, 0),
	},
	/**
	 * Assign monthly rainfall (mm) to each cell using thermal equator-driven
	 * atmospheric zones.
	 * @param cells - land + lake cells to assign rain to
	 */
	assignMonthly: (cells: Cell[]) => {
		// 1. Bin all world cells by longitude for TEQ computation
		const lonBinWidth = 15
		const lonBins = new Map<number, Cell[]>()
		window.world.cells.filter(c => !c.isWater || Math.abs(c.y) < 5).forEach((cell) => {
			const bin = Math.round(cell.x / lonBinWidth) * lonBinWidth
			if (!lonBins.has(bin)) lonBins.set(bin, [])
			lonBins.get(bin).push(cell)
		})

		// 2. Precompute TEQ per longitude bin per month (store in module-level cache)
		// Take the cell-based TEQ or the global EBM TEQ, whichever is the hotter latitude.
		_teqCache = new Map<number, number[]>()
		lonBins.forEach((binCells, bin) => {
			_teqCache.set(
				bin,
				range(12).map((m) => {
					const cellTEQ = TEMPERATURE.thermalEquator(m, binCells)
					// const globalTEQ = TEMPERATURE.globalTEQ(m)
					// Pick the latitude with the higher temperature
					return cellTEQ.lat // cellTEQ.temp >= globalTEQ.temp ? cellTEQ.lat : globalTEQ.lat
				}),
			)
		})

		// Lookup cell's TEQ for a given month
		const cellTeq = (cell: Cell, month: number): number => {
			const bin = Math.round(cell.x / lonBinWidth) * lonBinWidth
			return _teqCache.get(bin)?.[month]
		}

		// 3. Compute monthly rain for each cell
		cells.forEach((cell) => {
			const east = cell.rain.east
			const west = cell.rain.west
			cell.rain.weights = []
			cell.rain.monthly = range(12).map((month) => {
				const teq = cellTeq(cell, month)
				const weight = computeWeight(cell.y, teq, east, west)
				cell.rain.weights.push(weight)
				// Per-month temperature determines mm ceiling (smooth)
				const monthTemp = TEMPERATURE.monthly.mean({ cell, month })
				return weight.w * ceilingScale(monthTemp)
			})
			cell.rain.annual = cell.rain.monthly.reduce((s, v) => s + v, 0)
		})

		// 4. Neighbor smoothing (3 passes across all 12 months)
		range(3).forEach(() => {
			cells.forEach((cell) => {
				const neighbors = CELL.neighbors(cell)
					.concat([cell])
					.filter((n) => n.rain.monthly && !n.isWater)
				if (neighbors.length === 0) return
				cell.rain.monthly = range(12).map((month) => {
					const avg = mean(neighbors.map((n) => n.rain.monthly[month]))
					return avg ?? cell.rain.monthly[month]
				})
			})
		})
	},
	describe: (rainfall: number, key: "monthly" | "annual") => {
		if (rainfall > thresholds[key].saturated) return "saturated"
		if (rainfall > thresholds[key].humid) return "humid"
		if (rainfall > thresholds[key].wet) return "wet"
		if (rainfall > thresholds[key].moist) return "moist"
		if (rainfall > thresholds[key].moderate) return "moderate"
		if (rainfall > thresholds[key].low) return "low"
		if (rainfall > thresholds[key].dry) return "dry"
		if (rainfall > thresholds[key].arid) return "arid"
		return "parched"
	},
	monthly: {
		chance: (params: GetMonthlyRainParams) => {
			const { cell, month } = params
			const rain = RAIN.monthly.total({ cell, month })
			return rainChanceScale(rain)
		},
		color: (mm: number) => interpolateViridis(RAIN.monthly.scale(mm)),
		scale: scaleLinear(
			Object.values(thresholds.monthly).reverse(),
			MATH.scaleDiscrete(Object.keys(thresholds.monthly).length),
		),
		total: (params: GetMonthlyRainParams) => {
			const { cell } = params
			return cell.rain.monthly[params.month]
		},
	},
	thresholds,
}

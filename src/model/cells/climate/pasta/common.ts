import * as d3 from "d3"

import { TIME } from "../../../utilities/time"
import { EBM } from "../../ebm"

// --- Constants ---

/** Ratio of photosynthetically active radiation (PAR) to total insolation.
 * ~0.5 for a Sun-like star. */
export const DEFAULT_PAR_RATIO = 0.5

/** Insolation baseline for GDD / GDDi (standard, base 20 W/m²). */
export const BASELINE_STANDARD = 20

/** Insolation baseline for GDDz / GDDiz (zero, base 0 W/m²). */
export const BASELINE_ZERO = 0

// --- Temperature curve ---

/**
 * Growing degree-days per month.
 *
 *   base       → temperature where GDD starts accumulating
 *   plat_start → temperature where GDD plateaus at max (= plat_start - base)
 *   plat_end   → temperature where GDD begins declining
 *   comp       → compensation temperature; GDD reaches 0 again
 *
 * Presets:
 *   GDD5: dgm(temp, month, 5, 25, 40, 50)   → max 20/day
 *   GDD0: dgm(temp, month, 0, 20, 40, 60)   → max 20/day
 */
export function gdm(
	temp: number,
	month: number,
	base: number,
	plat_start: number,
	plat_end: number,
	comp: number,
): number {
	const max = plat_start - base
	const backSlope = max / (comp - plat_end)
	let gdd = temp - base
	if (temp > plat_start) gdd = max
	if (temp > plat_end) gdd = max - backSlope * (temp - plat_end)
	gdd = Math.max(0, gdd)
	return gdd * TIME.month.days(month).length
}

// --- Light ---

/** Lazy monthly insolation scale cache. */
let _worldId: string | undefined
let _monthlyScales: d3.ScaleLinear<number, number>[] | null = null

export function monthlyInsolationScales(): d3.ScaleLinear<number, number>[] {
	const currentId = window.world?.id
	if (_monthlyScales && _worldId === currentId) return _monthlyScales

	_worldId = currentId
	const { insolation, lats } = EBM.model

	_monthlyScales = Array.from({ length: 12 }, (_, month) => {
		const days = TIME.month.days(month)
		const avgByLat = insolation.map((row) => {
			const sum = days.reduce((s, d) => s + row[d], 0)
			return sum / days.length
		})
		return d3.scaleLinear<number>().domain(lats).range(avgByLat)
	})

	return _monthlyScales
}

/**
 * GDDi per-day contribution from average daily insolation.
 *   effective = insolation × parRatio
 *   GDDi/day  = clamp((effective - baseline) / 10, 0, 20)
 */
export function gddiDay(
	insolationWm2: number,
	parRatio: number,
	baseline: number,
): number {
	const effective = insolationWm2 * parRatio
	return Math.min(20, Math.max(0, (effective - baseline) / 10))
}

// --- Seasonal accumulation ---

/**
 * Largest sum of consecutive positive values in a circular array.
 * Returns Infinity if all values are positive.
 */
export function longestRun(monthly: number[]): number {
	if (monthly.every((v) => v > 0)) return Infinity

	const start = monthly.findIndex((v) => v === 0)
	let maxSum = 0
	let runSum = 0
	for (let i = 0; i < monthly.length; i++) {
		const val = monthly[(start + i) % monthly.length]
		if (val > 0) {
			runSum += val
			if (runSum > maxSum) maxSum = runSum
		} else {
			runSum = 0
		}
	}
	return maxSum
}

/**
 * Compute GDD and GInt annual totals using the 3-pass accumulation algorithm.
 *
 * 1. Forward-accumulate GInt, resetting on zero-GInt months.
 * 2. Backward-propagate GInt totals so every month in an interruption
 *    period knows the period's total.
 * 3. Forward-accumulate GDD, only interrupting where the GInt period
 *    total exceeds the threshold.
 *
 * All loops run twice so the last month wraps into the first.
 * Returns Infinity where all months accumulate without interruption.
 *
 * If gint is null, every month is treated as a severe interruption,
 * so GDD only accumulates through months with positive contribution
 * (equivalent to longestRun).
 */
export function gddTotal(
	gdd: number[],
	gint: number[] | null = null,
	threshold = 1250,
): { gdd: number; gint: number } {
	const n = gdd.length

	// --- Pass 1: forward-accumulate GInt ---
	const giAcc = gint ? gint.slice() : new Array<number>(n).fill(1e6)

	if (gint) {
		for (let pass = 0; pass < 2; pass++) {
			for (let t = 0; t < n; t++) {
				const prev = t === 0 ? giAcc[n - 1] : giAcc[t - 1]
				giAcc[t] = gint[t] > 0 ? gint[t] + prev : 0
			}
		}
		// Infinite if all months have GInt
		if (giAcc.every((v) => v > 0)) giAcc[n - 1] = 1e6

		// --- Pass 2: backward-propagate period totals ---
		for (let pass = 0; pass < 2; pass++) {
			for (let t = 0; t < n; t++) {
				const tn = n - (t + 1)
				const prev = (((tn - 1) % n) + n) % n
				if (gint[tn] > 0 && gint[prev] > 0) {
					giAcc[prev] = giAcc[tn]
				}
			}
		}
	}

	// --- Pass 3: forward-accumulate GDD ---
	const gddAcc = gdd.slice()
	for (let pass = 0; pass < 2; pass++) {
		for (let t = 0; t < n; t++) {
			const prev = t === 0 ? gddAcc[n - 1] : gddAcc[t - 1]
			const sum = gdd[t] + prev
			if (gdd[t] > 0) {
				gddAcc[t] = sum
			} else if (giAcc[t] > threshold) {
				gddAcc[t] = 0
			} else {
				gddAcc[t] = sum
			}
		}
	}

	const gddOut = gddAcc.every((v) => v > 0) ? Infinity : Math.max(...gddAcc)
	const gintOut = gint
		? giAcc.every((v) => v > 0)
			? Infinity
			: Math.max(...giAcc)
		: 0

	return { gdd: gddOut, gint: gintOut }
}

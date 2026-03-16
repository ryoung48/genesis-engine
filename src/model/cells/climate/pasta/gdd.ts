import { TIME } from "../../../utilities/time"
import { Cell } from "../../types"
import {
	BASELINE_STANDARD,
	BASELINE_ZERO,
	DEFAULT_PAR_RATIO,
	gddTotal,
	gddiDay,
	gdm,
	longestRun,
	monthlyInsolationScales,
} from "./common"

export interface GDDTotals {
	gdd: number
	gddz: number
	gddl: number
	gddi: number
	gddiz: number
	gint: number
}

/**
 * Compute all GDD and GInt totals for a cell in a single pass over months.
 *
 * - GDD, GDDz, GDDl: longest continuous growing season (3-pass accumulation
 *   with GInt-aware interruption; only breaks when GInt period > 1250).
 * - GDDi, GDDiz: annual insolation-based GDD (simple sum, no seasonal logic).
 * - GInt: longest consecutive growth interruption (longestRun).
 */
export function gddTotals(
	cell: Cell,
	parRatio = DEFAULT_PAR_RATIO,
): GDDTotals {
	const scales = monthlyInsolationScales()

	const mGDD: number[] = []
	const mGDDz: number[] = []
	const mGDDl: number[] = []
	const mGInt: number[] = []
	let gddiSum = 0
	let gddizSum = 0

	for (let month = 0; month < 12; month++) {
		const temp = cell.heat.monthly[month]
		const nDays = TIME.month.days(month).length
		const insol = scales[month](cell.y)

		// Temperature curves
		const g5 = gdm(temp, month, 5, 25, 40, 50)
		const g0 = gdm(temp, month, 0, 20, 40, 60)

		// Light curves
		const lightStd = gddiDay(insol, parRatio, BASELINE_STANDARD)
		const lightZero = gddiDay(insol, parRatio, BASELINE_ZERO)

		// GDD (base 5), light-interrupted
		mGDD.push(g5 > 0 && lightStd > 0 ? g5 : 0)

		// GDDz (base 0), light-interrupted
		mGDDz.push(g0 > 0 && lightZero > 0 ? g0 : 0)

		// GDDl (base 5, temp > 10 filter), light-interrupted
		const gl = temp > 10 ? g5 : 0
		mGDDl.push(gl > 0 && lightStd > 0 ? gl : 0)

		// GInt: 15/day ceiling minus effective GDDz (min of temp, light)
		const ceiling = 15 * nDays
		const effectiveGDDz = Math.min(g0, lightZero * nDays)
		mGInt.push(Math.max(0, ceiling - effectiveGDDz))

		// GDDi / GDDiz: simple annual sums
		gddiSum += lightStd * nDays
		gddizSum += lightZero * nDays
	}

	return {
		gdd: gddTotal(mGDD, mGInt).gdd,
		gddz: gddTotal(mGDDz, mGInt).gdd,
		gddl: gddTotal(mGDDl, mGInt).gdd,
		gddi: gddiSum,
		gddiz: gddizSum,
		gint: longestRun(mGInt),
	}
}

import { Cell } from "../../types"

/**
 * Minimum ice cover estimate (MinIce) for a cell.
 *
 * Without ExoPlaSim snow depth data, uses temperature-based fallbacks:
 *
 * Land ice:
 *   - CI (ice sheet): max monthly temp ≤ 0 °C AND annual precip > 0
 *     (subfreezing year-round with enough precipitation to accumulate ice).
 *   - Dry freeze: max temp ≤ 0 °C but near-zero precip → no ice accumulation.
 *
 * Sea ice (for water cells):
 *   - Of (seasonal): min monthly temp < -2 °C
 *   - Ofi (permanent): max monthly temp < -2 °C
 *
 * Returns an object with boolean flags and the key temperatures used.
 */

export interface IceCover {
	/** Permanent land ice (CI): subfreezing year-round with precipitation. */
	ice: boolean
	/** Subfreezing year-round but too dry for ice accumulation. */
	dryFreeze: boolean
	/** Seasonal sea ice (Of): some months below -2 °C. */
	seaIce: boolean
	/** Permanent sea ice (Ofi): all months below -2 °C. */
	seaIcePermanent: boolean
}

/** Minimum annual precipitation (mm) to accumulate ice. */
const MIN_PRECIP_FOR_ICE = 25

/** Sea ice formation threshold (°C). */
const SEA_ICE_THRESHOLD = -2

export function iceCover(cell: Cell): IceCover {
	const maxTemp = Math.max(...cell.heat.monthly)
	const minTemp = Math.min(...cell.heat.monthly)
	const annualPrecip = cell.rain.monthly.reduce((s, v) => s + v, 0)

	const subfreezing = maxTemp <= 0
	const hasIce = subfreezing && annualPrecip > MIN_PRECIP_FOR_ICE

	return {
		ice: hasIce,
		dryFreeze: subfreezing && !hasIce,
		seaIce: minTemp < SEA_ICE_THRESHOLD,
		seaIcePermanent: maxTemp < SEA_ICE_THRESHOLD,
	}
}

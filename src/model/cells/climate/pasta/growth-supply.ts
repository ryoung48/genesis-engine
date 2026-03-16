import { Cell } from "../../types"
import { gdm } from "./common"
import { aet } from "./aridity"

/**
 * Growth Supply (GrS).
 *
 * GrS = Gpr / AETavg, where:
 *   Gpr    = GDD-weighted average precipitation (mm/month)
 *   AETavg = unweighted average AET (mm/month)
 *
 * A low GrS indicates growing-season precipitation supplies only a small
 * portion of total evapotranspiration, so plants must rely on stored water —
 * the defining condition for Mediterranean biomes.
 *
 * Threshold: GrS < 0.8 (tuned) → Mediterranean (XM) zones.
 */
export function growthSupply(cell: Cell): number {
	const aetM = aet(cell)
	const precM = cell.rain.monthly

	let precGdd = 0
	let gddSum = 0
	let aetSum = 0

	for (let month = 0; month < 12; month++) {
		const g = gdm(cell.heat.monthly[month], month, 5, 25, 40, 50)
		precGdd += precM[month] * g
		gddSum += g
		aetSum += aetM[month]
	}

	const gpr = gddSum > 0 ? precGdd / gddSum : 0
	const aetAvg = aetSum / 12

	return aetAvg > 0 ? gpr / aetAvg : 1
}

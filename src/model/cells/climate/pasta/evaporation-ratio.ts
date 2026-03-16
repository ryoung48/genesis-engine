import { Cell } from "../../types"
import { aet } from "./aridity"

/**
 * Evaporation Ratio (Evr).
 *
 * Evr = total annual AET / total annual precipitation.
 *
 * The portion of precipitation that evaporates rather than running off.
 * A low Evr indicates prolonged periods where precipitation far exceeds PET,
 * implying saturated soil and adaptation to heavy rainfall/runoff.
 *
 * Thresholds:
 *   Evr < 0.4  → hyperpluvial rainforest (TUrp)
 *   Evr < 0.45 → pluvial zones (Xxp)
 */
export function evaporationRatio(cell: Cell): number {
	const aetM = aet(cell)
	const precM = cell.rain.monthly

	let aetSum = 0
	let precSum = 0

	for (let month = 0; month < 12; month++) {
		aetSum += aetM[month]
		precSum += precM[month]
	}

	return precSum > 0 ? aetSum / precSum : 1
}

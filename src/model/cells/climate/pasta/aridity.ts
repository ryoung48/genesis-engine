import { TIME } from "../../../utilities/time"
import { Cell } from "../../types"
import { gdm } from "./common"

/** Maximum soil moisture capacity (cm). */
const SOIL_CAP = 50

/** Threshold below which soil evaporation is limited (cm). */
const SOIL_LIMIT = 25

/** Convergence threshold for soil moisture loop (cm). */
const SOIL_EPSILON = 1

/**
 * Kalike potential evapotranspiration (PET) in mm/month.
 *
 * Based on Köppen's 20 mm/month/°C rule for aridity, tuned for
 * Pasta bioclimate zone distribution on Earth.
 *
 *   PET (mm/month) = max(0, T × 7/30 × daysInMonth)
 */
export function pet(cell: Cell): number[] {
	const result: number[] = []
	for (let month = 0; month < 12; month++) {
		const temp = cell.heat.monthly[month]
		const nDays = TIME.month.days(month).length
		result.push(Math.max(0, (temp * 7) / 30 * nDays))
	}
	return result
}

/**
 * Actual evapotranspiration (AET) in mm/month via soil moisture model.
 *
 * Each month:
 * - If precip ≥ PET: excess fills soil up to SOIL_CAP, AET = PET.
 * - If precip < PET: deficit draws from soil.
 *   - If soil > SOIL_LIMIT: full deficit from soil, AET = PET.
 *   - If soil ≤ SOIL_LIMIT: soil evap = min(soil, deficit × soil/SOIL_LIMIT),
 *     AET = precip + soil evap.
 *
 * Iterates across the year until start/end soil moisture converges (< 1 cm diff).
 */
export function aet(cell: Cell): number[] {
	const petM = pet(cell)
	const precM = cell.rain.monthly

	const result = new Array<number>(12).fill(0)
	let soil = SOIL_CAP / 2 // initial guess

	for (let iter = 0; iter < 20; iter++) {
		const startSoil = soil

		for (let month = 0; month < 12; month++) {
			const p = precM[month]
			const pe = petM[month]

			if (p >= pe) {
				// Surplus: AET = PET, excess fills soil
				soil = Math.min(SOIL_CAP, soil + (p - pe))
				result[month] = pe
			} else {
				// Deficit: draw from soil
				const deficit = pe - p
				let soilEvap: number
				if (soil > SOIL_LIMIT) {
					soilEvap = Math.min(soil, deficit)
				} else {
					soilEvap = Math.min(soil, deficit * (soil / SOIL_LIMIT))
				}
				soil -= soilEvap
				result[month] = p + soilEvap
			}
		}

		if (Math.abs(soil - startSoil) < SOIL_EPSILON) break
	}

	return result
}

export interface Aridity {
	/** Aridity factor: annual AET / annual PET. */
	ar: number
	/** Growth aridity: GDD-weighted AET / GDD-weighted PET. */
	gar: number
}

/**
 * Aridity factor (Ar) and growth aridity (GAr) for a cell.
 *
 * Ar  = total annual AET / total annual PET.
 * GAr = GDD-weighted AET / GDD-weighted PET, where each month's
 *       AET and PET are weighted by the raw monthly GDD (base 5)
 *       count (simple total, no seasonal interruption logic).
 *
 * Thresholds:
 *   Ar > 0.9  → tropical rainforest (TXr)
 *   Ar > 0.75 → seasonal forest (Xf)
 *   Ar < 0.2  → arid (A)
 *   Ar < 0.06 → hyperarid desert (Ah)
 *   GAr < 0.5 → semiarid (XA)
 */
export function aridity(cell: Cell): Aridity {
	const petM = pet(cell)
	const aetM = aet(cell)

	let petSum = 0
	let aetSum = 0
	let petGdd = 0
	let aetGdd = 0

	for (let month = 0; month < 12; month++) {
		const g = gdm(cell.heat.monthly[month], month, 5, 25, 40, 50)

		petSum += petM[month]
		aetSum += aetM[month]
		petGdd += petM[month] * g
		aetGdd += aetM[month] * g
	}

	return {
		ar: petSum > 0 ? aetSum / petSum : 1,
		gar: petGdd > 0 ? aetGdd / petGdd : 1,
	}
}

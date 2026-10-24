import type { RollGreenhouseFactorParams } from "@/model/celestial/planet/environment/greenhouse/types"
import { DICE } from "@/model/shared/random/dice"
import type { SharedRng } from "@/model/shared/random/rng"

// Earth's greenhouse factor, T_eq·(1 + g/4) with its real Bond albedo 0.3: fitted to Earth's land temperatures in the
// retired zonal energy balance; a planet's factor scales from it with √pressure
const EARTH_GREENHOUSE_FACTOR = 0.596

function estimateGreenhouseFactor(pressure: number): number {
	return EARTH_GREENHOUSE_FACTOR * Math.sqrt(Math.max(pressure, 0))
}

function rollGreenhouseFactor(params: RollGreenhouseFactorParams): number {
	const { rng, pressureBar, atmosphereCode } = params
	let factor = 0.5 * Math.sqrt(Math.max(pressureBar, 0))
	if (atmosphereCode === 0) return factor
	if (
		(atmosphereCode >= 1 && atmosphereCode <= 9) ||
		atmosphereCode === 13 ||
		atmosphereCode === 14
	) {
		factor += DICE.roll3d6(rng) * 0.01
	} else if (atmosphereCode === 10 || atmosphereCode === 15) {
		factor *= Math.max(rng.randint(1, 6) - 1, 0.5)
	} else if (
		atmosphereCode === 11 ||
		atmosphereCode === 12 ||
		atmosphereCode === 16 ||
		atmosphereCode === 17
	) {
		const roll = rng.randint(1, 6)
		factor *= roll <= 5 ? roll : DICE.roll3d6(rng)
	}
	return factor
}

function rollGasGiantGreenhouseFactor(rng: Pick<SharedRng, "uniform">): number {
	return rng.uniform(1.5, 2)
}

export const GREENHOUSE_ESTIMATE = {
	earthGreenhouseFactor: EARTH_GREENHOUSE_FACTOR,
	estimateGreenhouseFactor,
	rollGreenhouseFactor,
	rollGasGiantGreenhouseFactor,
}

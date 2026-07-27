import { CONSTANTS } from "@/model/climate/ebm/constants"
import type { RollGreenhouseFactorParams } from "@/model/climate/ebm/greenhouse-estimate/types"
import { DICE } from "@/model/shared/dice"
import type { SharedRng } from "@/model/shared/rng"

function estimateGreenhouseFactor(pressure: number): number {
	return (
		CONSTANTS.embConstants.surface.GREENHOUSE_FACTOR *
		Math.sqrt(Math.max(pressure, 0))
	)
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
	estimateGreenhouseFactor,
	rollGreenhouseFactor,
	rollGasGiantGreenhouseFactor,
}

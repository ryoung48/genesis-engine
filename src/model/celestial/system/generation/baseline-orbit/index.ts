import type {
	AvailableOrbitResolutionInput,
	BaselineOrbitRollInput,
} from "@/model/celestial/system/generation/baseline-orbit/types"
import { DICE } from "@/model/shared/random/dice"

function resolveAvailableOrbit({
	rng,
	orbitNumber,
	minimumOrbitNumber,
	maximumOrbitNumber,
}: AvailableOrbitResolutionInput): number {
	if (orbitNumber >= minimumOrbitNumber && orbitNumber <= maximumOrbitNumber) {
		return orbitNumber
	}
	const variance = Math.abs(DICE.roll2d6(rng) - 7) / 10
	if (orbitNumber < minimumOrbitNumber) {
		return Math.min(maximumOrbitNumber, minimumOrbitNumber + variance)
	}
	return Math.max(minimumOrbitNumber, maximumOrbitNumber - variance)
}

function roll({
	rng,
	baselineNumber,
	totalWorlds,
	habitableZoneOrbitNumber,
	minimumOrbitNumber,
	maximumOrbitNumber,
}: BaselineOrbitRollInput): number | null {
	if (
		baselineNumber === null ||
		totalWorlds <= 0 ||
		maximumOrbitNumber <= minimumOrbitNumber
	) {
		return null
	}
	let orbitNumber: number
	if (baselineNumber >= 1 && baselineNumber <= totalWorlds) {
		orbitNumber =
			habitableZoneOrbitNumber +
			(DICE.roll2d6(rng) - 7) / (habitableZoneOrbitNumber >= 1 ? 10 : 100)
	} else if (baselineNumber < 1) {
		orbitNumber =
			minimumOrbitNumber >= 1
				? habitableZoneOrbitNumber -
					baselineNumber +
					totalWorlds +
					(DICE.roll2d6(rng) - 2) / 10
				: minimumOrbitNumber -
					baselineNumber / 10 +
					(DICE.roll2d6(rng) - 2) / 100
	} else {
		const unscaledOrbitNumber =
			habitableZoneOrbitNumber - baselineNumber + totalWorlds
		orbitNumber =
			unscaledOrbitNumber >= 1
				? unscaledOrbitNumber + (DICE.roll2d6(rng) - 7) / 5
				: habitableZoneOrbitNumber -
					baselineNumber / 10 +
					totalWorlds / 10 +
					(DICE.roll2d6(rng) - 7) / 50
		if (orbitNumber < 0) {
			orbitNumber = Math.max(
				habitableZoneOrbitNumber - 0.1,
				minimumOrbitNumber + totalWorlds * 0.01,
			)
		}
	}
	return resolveAvailableOrbit({
		rng,
		orbitNumber,
		minimumOrbitNumber,
		maximumOrbitNumber,
	})
}

export const BASELINE_ORBIT = {
	roll,
}

import { STAR } from "@/model/celestial/star"
import type { BaselineNumberRollInput } from "@/model/celestial/system/generation/baseline-number/types"
import { DICE } from "@/model/shared/random/dice"

function worldCountDM(totalWorlds: number): number {
	if (totalWorlds < 6) return -4
	if (totalWorlds <= 9) return -3
	if (totalWorlds <= 12) return -2
	if (totalWorlds <= 15) return -1
	if (totalWorlds <= 17) return 0
	if (totalWorlds <= 20) return 1
	return 2
}

function luminosityClassDM(
	luminosityClass: BaselineNumberRollInput["hostLuminosityClass"],
): number {
	if (
		luminosityClass === "Ia" ||
		luminosityClass === "Ib" ||
		luminosityClass === "II"
	) {
		return 3
	}
	if (luminosityClass === "III") return 2
	if (luminosityClass === "IV") return 1
	if (luminosityClass === "VI") return -1
	return 0
}

function roll({
	rng,
	totalWorlds,
	otherStarCount,
	hasEpistellarCompanion,
	hostSpectralClass,
	hostLuminosityClass,
}: BaselineNumberRollInput): number | null {
	if (totalWorlds <= 0) return null
	const dm =
		worldCountDM(totalWorlds) -
		otherStarCount -
		(hasEpistellarCompanion ? 2 : 0) -
		(STAR.isPostStellar(hostSpectralClass) ? 2 : 0) +
		luminosityClassDM(hostLuminosityClass)
	return DICE.roll2d6(rng) + dm
}

export const BASELINE_NUMBER = {
	roll,
}

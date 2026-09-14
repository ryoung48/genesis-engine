import { STAR } from "@/model/celestial/star"
import type {
	WorldTypeCounts,
	WorldTypeCountsInput,
} from "@/model/celestial/system/generation/world-type-counts/types"
import { DICE } from "@/model/shared/random/dice"

function gasGiantQuantity(roll: number): number {
	if (roll <= 4) return 1
	if (roll <= 6) return 2
	if (roll <= 8) return 3
	if (roll <= 11) return 4
	if (roll === 12) return 5
	return 6
}

function beltQuantity(roll: number): number {
	if (roll <= 6) return 1
	if (roll <= 11) return 2
	return 3
}

function roll({
	rng,
	primarySpectralClass,
	primaryLuminosityClass,
	primaryMassSol,
	primaryAgeGyr,
	isLoneStar,
	systemPostStellarCount,
	systemStarCount,
}: WorldTypeCountsInput): WorldTypeCounts {
	const primaryPostStellar = STAR.isPostStellar(primarySpectralClass)
	const primaryBrownDwarf = STAR.isBrownDwarf(primarySpectralClass)
	const gasGiantPresent = DICE.roll2d6(rng) < 10
	const gasGiantDM =
		(isLoneStar && primaryLuminosityClass === "V" ? 1 : 0) -
		(primaryBrownDwarf ? 2 : 0) -
		(primaryPostStellar ? 2 : 0) -
		systemPostStellarCount -
		(systemStarCount >= 4 ? 1 : 0)
	const gasGiantCount = gasGiantPresent
		? gasGiantQuantity(DICE.roll2d6(rng) + gasGiantDM)
		: 0

	const beltPresent = DICE.roll2d6(rng) >= 8
	const beltDM =
		(gasGiantCount > 0 ? 1 : 0) +
		(STAR.isProto({ ageGyr: primaryAgeGyr, massSol: primaryMassSol }) ? 3 : 0) +
		(STAR.isPrimordial({ ageGyr: primaryAgeGyr }) ? 2 : 0) +
		(primaryPostStellar ? 1 : 0) +
		systemPostStellarCount +
		(systemStarCount >= 2 ? 1 : 0)
	const beltCount = beltPresent ? beltQuantity(DICE.roll2d6(rng) + beltDM) : 0

	const terrestrialBase = DICE.roll2d6(rng) - 2 - systemPostStellarCount
	const terrestrialCount =
		terrestrialBase < 3
			? rng.randint(1, 3) + 2
			: terrestrialBase + rng.randint(1, 3) - 1
	return {
		gasGiantCount,
		beltCount,
		terrestrialCount,
		totalWorlds: gasGiantCount + beltCount + terrestrialCount,
	}
}

export const WORLD_TYPE_COUNTS = {
	roll,
}

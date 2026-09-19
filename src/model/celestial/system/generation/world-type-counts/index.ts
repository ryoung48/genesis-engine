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

// Book p. 228: "to check for a planetary system when the primary star is a
// dead star, roll 2D" -- DM-2 for a multiple-dead-star system (two or more
// post-stellar objects anywhere in the system, including the primary), DM-2
// for a neutron star/pulsar/magnetar anywhere in the system, DM-4 for a
// black hole anywhere in the system. Exists on 8+, but unconditionally on a
// natural 12 regardless of DMs. Only consulted at all when the primary
// itself is post-stellar -- a normal-star primary with a dead-star
// companion never rolls this gate.
function deadStarPlanetarySystemExists({
	rng,
	systemPostStellarCount,
	systemHasNeutronStar,
	systemHasBlackHole,
}: {
	rng: WorldTypeCountsInput["rng"]
	systemPostStellarCount: number
	systemHasNeutronStar: boolean
	systemHasBlackHole: boolean
}): boolean {
	const naturalRoll = DICE.roll2d6(rng)
	if (naturalRoll === 12) return true
	const dm =
		(systemPostStellarCount >= 2 ? -2 : 0) +
		(systemHasNeutronStar ? -2 : 0) +
		(systemHasBlackHole ? -4 : 0)
	return naturalRoll + dm >= 8
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
	systemHasNeutronStar,
	systemHasBlackHole,
}: WorldTypeCountsInput): WorldTypeCounts {
	const primaryPostStellar = STAR.isPostStellar(primarySpectralClass)
	if (
		primaryPostStellar &&
		!deadStarPlanetarySystemExists({
			rng,
			systemPostStellarCount,
			systemHasNeutronStar,
			systemHasBlackHole,
		})
	) {
		return {
			gasGiantCount: 0,
			beltCount: 0,
			terrestrialCount: 0,
			totalWorlds: 0,
		}
	}
	const primaryBrownDwarf = STAR.isBrownDwarf(primarySpectralClass)
	// Book p. 228: a dead-star system's gas giant absence threshold moves
	// from the standard 10+ to 6+ (both framings -- "absent on 6+" here, or
	// the book's alternate "present on 9+" -- land on the same ~28%
	// presence probability; this codebase already implements existence via
	// the "absent on X+" framing, so that's the one ported). The quantity
	// roll's own post-stellar DMs (gasGiantDM below) are unchanged.
	const gasGiantPresent = DICE.roll2d6(rng) < (primaryPostStellar ? 6 : 10)
	const gasGiantDM =
		(isLoneStar && primaryLuminosityClass === "V" ? 1 : 0) -
		(primaryBrownDwarf ? 2 : 0) -
		(primaryPostStellar ? 2 : 0) -
		systemPostStellarCount -
		(systemStarCount >= 4 ? 1 : 0)
	const gasGiantCount = gasGiantPresent
		? gasGiantQuantity(DICE.roll2d6(rng) + gasGiantDM)
		: 0

	const primaryProto = STAR.isProto({
		ageGyr: primaryAgeGyr,
		massSol: primaryMassSol,
	})
	const primaryPrimordial = STAR.isPrimordial({ ageGyr: primaryAgeGyr })
	// Book p. 38's Planetoid Belt Quantity table lists "protostar DM+3" and
	// "primordial DM+2" as alternatives, not stacking conditions -- a system
	// is in exactly one of these states. STAR.isPrimordial's age-only
	// definition (ageGyr < 0.1) is a strict superset of STAR.isProto's
	// (ageGyr < 0.01 && massSol < 8), so a proto star is always "primordial"
	// too by that definition alone; without this precedence a proto star
	// would silently get +5, not the book's +3.
	// Book p. 228: a dead-star system's belt existence threshold moves from
	// the standard 8+ to 6+ -- composes with (but never overlaps in
	// practice with) the primordial-only existence DM above, since a dead
	// star is neither proto nor primordial by this codebase's age-based
	// definitions.
	const beltPresent =
		DICE.roll2d6(rng) >=
		(primaryPostStellar ? 6 : 8) - (primaryPrimordial && !primaryProto ? 4 : 0)
	const beltDM =
		(gasGiantCount > 0 ? 1 : 0) +
		(primaryProto ? 3 : primaryPrimordial ? 2 : 0) +
		(primaryPostStellar ? 1 : 0) +
		systemPostStellarCount +
		(systemStarCount >= 2 ? 1 : 0)
	const beltCount = beltPresent ? beltQuantity(DICE.roll2d6(rng) + beltDM) : 0

	// Book p. 228: a dead-star system's terrestrial count uses 1D-2 instead
	// of the standard 2D-2 -- a different die count, not a DM on the
	// standard roll.
	const terrestrialBase =
		(primaryPostStellar
			? DICE.rollDice({ rng, count: 1, sides: 6 })
			: DICE.roll2d6(rng)) -
		2 -
		systemPostStellarCount
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

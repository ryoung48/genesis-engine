import { STAR } from "@/model/celestial/star"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import { RNG } from "@/model/shared/rng"
import { LANGUAGE } from "@/model/society/language/languages"

// Star age is rolled from its own salted rng derived from the same system
// seed, decorrelated from the main body-generation rng sequence (created
// with a fresh `createRng` instance below) so callers (e.g. the UI's star
// stat card) can reproduce the exact same value from just (seed, massSol)
// without needing to replay the whole body-generation sequence.
const STAR_AGE_SEED_SALT = 0x9e3779b1

function getStarAgeGyr({
	seed,
	massSol,
}: {
	seed: number
	massSol: number
}): number {
	if (seed === SOL_DATA.solSeed) return SOL_DATA.solStarAgeGyr
	const rng = RNG.createRng({ seed: seed + STAR_AGE_SEED_SALT })
	return STAR.rollStarAgeGyr({ rng, massSol })
}

/** The star's own name, from the same per-system language every sibling
 * planet/moon in this system is named from (see generateSystemBodies) --
 * spawning the language again here (rather than threading generateSystemBodies'
 * own instance out) is cheap and keeps this callable standalone from the UI
 * wherever just a star label is needed. Sol keeps its real name (SOL_STAR_NAME
 * in sol-system.ts) untouched -- callers should check `seed === SOL_SEED`
 * themselves rather than calling this for Sol. */
function generateStarName(seed: number): string {
	const lang = LANGUAGE.spawn(`system:${seed}`)
	return LANGUAGE.word.simple({
		lang,
		key: "region",
		namespace: "planet",
		slot: "star",
	}).word
}

export const STAR_IDENTITY = { getStarAgeGyr, generateStarName }

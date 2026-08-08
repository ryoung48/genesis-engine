import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import { TEXT } from "@/model/shared/text"
import { LANGUAGE } from "@/model/society/language/languages"

// Every generated system's forced main world is a literal Earth clone (see
// body/index.ts), so its star should read as roughly Sol-like too -- but a
// star whose mass gives it a shorter main-sequence lifespan than Sol's own
// age can't actually BE that old, so this caps at whichever is smaller:
// Sol's real age, or this star's own main-sequence lifespan (same formula as
// STAR.rollStarAgeGyr's mainSequenceLifespanGyr). A star picked heavier than
// Sol (shorter-lived) reads as older-for-its-type instead of impossibly
// ancient; anything at or lighter than Sol just gets Sol's own age.
function getStarAgeGyr({ massSol }: { massSol: number }): number {
	const mainSequenceLifespanGyr = 10 / massSol ** 2.5
	return Math.min(mainSequenceLifespanGyr, SOL_DATA.solStarAgeGyr)
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
	// LANGUAGE.word.simple's slot-based path returns the raw (lowercase) word
	// -- every other caller (see names/index.ts) title-cases it themselves.
	return TEXT.titleCase(
		LANGUAGE.word.simple({
			lang,
			key: "region",
			namespace: "planet",
			slot: "star",
		}).word,
	)
}

export const STAR_IDENTITY = { getStarAgeGyr, generateStarName }

import { STAR_IDENTITY } from "@/model/celestial/system/generation/star-identity"
import { TEXT } from "@/model/shared/text"
import { LANGUAGE } from "@/model/society/language/languages"
import type { Language } from "@/model/society/language/languages/types"

/** The galaxy's own name, from a language spawned off its own seed --
 * mirrors STAR_IDENTITY.generateStarName's per-system naming (same
 * LANGUAGE.spawn/word.simple shape), just keyed to `galaxy:${seed}` instead
 * of `system:${seed}` so a galaxy's name never collides with any system
 * inside it that happens to share the same numeric seed. */
function generateGalaxyName(seed: number): string {
	const lang = LANGUAGE.spawn(`galaxy:${seed}`)
	return TEXT.titleCase(
		LANGUAGE.word.simple({
			lang,
			key: "region",
			namespace: "galaxy",
			slot: "galaxy",
		}).word,
	)
}

/** Lazily-built, process-lifetime cache of one spawned Language per nation,
 * keyed by its `galaxy:${seed}:nation:${index}` spawn seed. LANGUAGE.spawn
 * builds a whole phonology/phonotactics table, so it's only paid the first
 * time a nation is actually named or one of its systems is opened -- never
 * up front for a whole galaxy's worth of nations. */
const nationLanguageCache = new Map<string, Language>()

function nationLanguage(seed: number, nationIndex: number): Language {
	const key = `galaxy:${seed}:nation:${nationIndex}`
	let lang = nationLanguageCache.get(key)
	if (!lang) {
		lang = LANGUAGE.spawn(key)
		nationLanguageCache.set(key, lang)
	}
	return lang
}

/** One nation's own name, from its lazily-spawned language (see
 * nationLanguage) -- scoped per-nation so two nations in the same galaxy
 * don't share a name, and the same language its owned systems are named
 * from (see generateSystemStarName). */
function generateNationName(seed: number, nationIndex: number): string {
	return TEXT.titleCase(
		LANGUAGE.word.simple({
			lang: nationLanguage(seed, nationIndex),
			key: "region",
			namespace: "nation",
			slot: "nation",
		}).word,
	)
}

/** Lazily-built cache of one spawned Language per culture, keyed by its
 * `galaxy:${seed}:culture:${index}` spawn seed -- same shape/reasoning as
 * nationLanguageCache above, kept separate so a culture and a nation that
 * happen to share an index don't share a tongue. */
const cultureLanguageCache = new Map<string, Language>()

function cultureLanguage(seed: number, cultureIndex: number): Language {
	const key = `galaxy:${seed}:culture:${cultureIndex}`
	let lang = cultureLanguageCache.get(key)
	if (!lang) {
		lang = LANGUAGE.spawn(key)
		cultureLanguageCache.set(key, lang)
	}
	return lang
}

/** One culture's own name, from its lazily-spawned language -- the galaxy
 * culture-mode analogue of generateNationName. */
function generateCultureName(seed: number, cultureIndex: number): string {
	return TEXT.titleCase(
		LANGUAGE.word.simple({
			lang: cultureLanguage(seed, cultureIndex),
			key: "region",
			namespace: "culture",
			slot: "culture",
		}).word,
	)
}

/** A star's name in the language of the nation that owns its system, so a
 * realm's worlds all read as belonging to the same tongue. The per-star
 * `slot` keeps each star in a nation deterministically distinct while
 * sharing that nation's phonology. Systems no nation claims (edge/unassigned,
 * `nationIndex < 0`) fall back to the per-system language
 * (STAR_IDENTITY.generateStarName), exactly as before. */
function generateSystemStarName({
	seed,
	nationIndex,
	starSeed,
}: {
	seed: number
	nationIndex: number
	starSeed: number
}): string {
	if (nationIndex < 0) return STAR_IDENTITY.generateStarName(starSeed)
	return TEXT.titleCase(
		LANGUAGE.word.simple({
			lang: nationLanguage(seed, nationIndex),
			key: "region",
			namespace: "planet",
			slot: `star:${starSeed}`,
		}).word,
	)
}

export const GALAXY_IDENTITY = {
	generateGalaxyName,
	generateNationName,
	generateCultureName,
	generateSystemStarName,
}

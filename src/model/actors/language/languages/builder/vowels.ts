import type { LanguageRng } from "../rng"
import { PhonemeCatalog, type PhonotacticStyle, vowelRules } from "../types"
import { validTerms } from "."

const basicVowels = {
	A: "a",
	E: "e",
	I: "i",
	O: "o",
	U: "u",
	Y: "i",
}

const exoticVowels = (ending: PhonemeCatalog, dice: LanguageRng) => {
	const umlauts = {
		A: dice.choice(["ä", "å"]),
		E: "ë",
		I: "ï",
		O: dice.choice(["ø", "ö"]),
		U: "ü",
		Y: "ÿ",
	}
	const acutes = {
		A: "á",
		E: "é",
		I: "í",
		O: "ó",
		U: "ú",
		Y: "ý",
	}
	const welsh = {
		A: "â",
		E: "ê",
		I: "î",
		O: "ô",
		U: "û",
		Y: "î",
	}
	const macrons = {
		A: "ā",
		E: "ē",
		I: "ī",
		O: "ō",
		U: "ū",
		Y: "y",
	}
	return dice.choice([
		umlauts,
		acutes,
		ending === PhonemeCatalog.MIDDLE_CONSONANT ? welsh : macrons,
	])
}

const diphthongRules = {
	front: ["aa", "ae", "ai", "au", "eo", "oo", "ou", "uu", "yu"],
	back: [
		"aa",
		"ae",
		"ea",
		"ee",
		"eo",
		"eu",
		"ia",
		"ya",
		"ye",
		"ii",
		"io",
		"yo",
		"iu",
		"yu",
		"oo",
		"ua",
		"ue",
		"ui",
		"uu",
	],
	end: [
		"aa",
		"ae",
		"ai",
		"ao",
		"ea",
		"eo",
		"ia",
		"io",
		"oa",
		"oe",
		"oi",
		"ou",
		"ua",
		"ui",
		"uo",
		"ya",
		"ye",
		"yo",
		"yu",
	],
}

const diphthongs = (
	vowels: string[],
	consonants: string[],
	dice: LanguageRng,
) => {
	const { back, front } = vowelRules
	const validDiphthong = (diphthongs: string[]) => {
		const available = validTerms(diphthongs, vowels)
		const compatible = available.filter((v) => {
			const validBack = !back[v] || back[v].some((c) => consonants.includes(c))
			const validFront =
				!front[v] || front[v].some((c) => consonants.includes(c))
			return validBack || validFront || diphthongRules.end.includes(v)
		})
		return dice.choice(
			compatible.length > 0
				? compatible
				: available.length > 0
					? available
					: [vowels[0] ?? "a"],
		)
	}
	return {
		A: validDiphthong(["ae", "ai", "ao", "au"]),
		E: validDiphthong(["ea", "ei", "eo", "eu"]),
		I: validDiphthong(["ia", "ie", "io", "iu"]),
		O: validDiphthong(["oa", "oe", "oi", "ou"]),
		U: validDiphthong(["ua", "ue", "ui", "uo"]),
		Y: validDiphthong(["ya", "ye", "yo", "yu"]),
	}
}
export const buildBasicVowels = (params: {
	ending: PhonemeCatalog
	phonotacticStyle: PhonotacticStyle
	dice: LanguageRng
}) => {
	const vowelCount = (
		{
			open: params.dice.randint(3, 5),
			balanced: params.dice.randint(2, 5),
			closed: params.dice.randint(2, 4),
		} as const
	)[params.phonotacticStyle]
	const i = params.dice.weightedChoice([
		{ v: "i", w: 0.9 },
		{ v: "y", w: 0.1 },
	])
	const required = ["a"]
	if (params.ending === PhonemeCatalog.MIDDLE_VOWEL)
		required.push(params.dice.choice(["o", "u"]))
	const optional = ["e", i, "o", "u", "a"].filter((v) => !required.includes(v))
	const vowels = params.dice
		.sample(optional, vowelCount - required.length)
		.concat(required)
	return vowels
}
export const buildComplexVowels = (params: {
	consonants: string[]
	vowels: string[]
	stops: number
	ending: PhonemeCatalog
	phonotacticStyle: PhonotacticStyle
	diacriticConsonants?: boolean
	dice: LanguageRng
}) => {
	const { vowels, consonants, stops, ending, diacriticConsonants, dice } =
		params
	const doubles = {
		A: "aa",
		E: "ee",
		I: "ii",
		O: "oo",
		U: "uu",
		Y: "i",
	}
	const vowelStyleWeights = {
		open: { doubles: 0.06, diphthongs: 0.62, decorative: 0.32 },
		balanced: { doubles: 0.1, diphthongs: 0.5, decorative: 0.4 },
		closed: { doubles: 0.2, diphthongs: 0.32, decorative: 0.48 },
	}[params.phonotacticStyle]
	const vowelOrthography: Record<string, string> = params.dice.weightedChoice([
		{ v: doubles, w: vowelStyleWeights.doubles },
		{
			v: diphthongs(vowels, consonants, dice),
			w: vowelStyleWeights.diphthongs,
		},
		{
			v:
				stops > 0 || diacriticConsonants
					? basicVowels
					: exoticVowels(ending, dice),
			w: vowelStyleWeights.decorative,
		},
	])
	const specialVowels = params.dice
		.sample(
			["A", "E", "I", "O", "U", "Y"].filter((v) =>
				vowels.includes(v.toLowerCase()),
			),
			3,
		)
		.map((v) => vowelOrthography[v])
		.filter((v) => v)
	const allVowels =
		params.phonotacticStyle === "open"
			? specialVowels.concat(vowels)
			: params.dice.random > 0.9
				? vowels
				: specialVowels.concat(vowels)
	const validVowels = (rules: string[]) =>
		allVowels.filter((v) => v.length < 2 || rules.includes(v))
	return {
		uniqueVowels: allVowels,
		vowelPhonemes: {
			[PhonemeCatalog.START_VOWEL]: vowels.filter((v) => v !== "y"),
			[PhonemeCatalog.FRONT_VOWEL]: validVowels(diphthongRules.front),
			[PhonemeCatalog.MIDDLE_VOWEL]: vowels,
			[PhonemeCatalog.BACK_VOWEL]: validVowels(diphthongRules.back),
			[PhonemeCatalog.END_VOWEL]: validVowels(diphthongRules.end),
		},
	}
}

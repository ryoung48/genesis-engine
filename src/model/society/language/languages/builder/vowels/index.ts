import {
	PhonemeCatalog,
	vowelRules,
	type LanguageRng,
} from "@/model/society/language/languages/types"
import { BUILDER } from "@/model/society/language/languages/builder"
import type { DiphthongsParams } from "@/model/society/language/languages/builder/vowels/types"

const basicVowels = {
	A: "a",
	E: "e",
	I: "i",
	O: "o",
	U: "u",
	Y: "i",
}

const exoticVowels = (dice: LanguageRng) => {
	const umlauts = {
		A: dice.choice(["ä", "å", "aä"]),
		E: dice.choice(["ë", "ë", "aë"]),
		I: "ï",
		O: dice.choice(["ø", "ö", "oö"]),
		U: dice.choice(["ü", "ü", "uü"]),
		Y: "ÿ",
	}
	const acutes = {
		A: "á",
		E: dice.choice(["é", "é", "éo", "ée"]),
		I: dice.choice(["í", "í", "ía", "ío"]),
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
	return dice.choice([umlauts, acutes, welsh])
}

const diphthongRules = {
	front: [
		"aa",
		"aä",
		"ae",
		"aë",
		"ai",
		"āo",
		"au",
		"eo",
		"éo",
		"oo",
		"oö",
		"ou",
		"uu",
		"uü",
		"yu",
	],
	back: [
		"aa",
		"aä",
		"äe",
		"ae",
		"aë",
		"ea",
		"ee",
		"eo",
		"éo",
		"eu",
		"ia",
		"ía",
		"ya",
		"ye",
		"ii",
		"io",
		"yo",
		"ÿo",
		"ýo",
		"iu",
		"yu",
		"ÿu",
		"ýu",
		"oo",
		"oö",
		"ua",
		"ue",
		"ui",
		"uu",
		"uü",
	],
	end: [
		"aa",
		"ae",
		"äe",
		"ai",
		"ao",
		"āo",
		"ea",
		"ée",
		"eo",
		"éo",
		"ia",
		"ía",
		"io",
		"ío",
		"oa",
		"oe",
		"oi",
		"ou",
		"ua",
		"ui",
		"ūi",
		"uo",
		"ya",
		"ÿa",
		"ýa",
		"ye",
		"ÿe",
		"ýe",
		"yo",
		"ÿo",
		"ýo",
		"yu",
		"ÿu",
		"ýu",
	],
}

const diphthongs = ({ vowels, consonants, dice }: DiphthongsParams) => {
	const { back, front } = vowelRules
	const validDiphthong = (prospects: string[]) =>
		dice.choice(
			BUILDER.validTerms({ prospects, letters: vowels }).filter((v) => {
				const validBack =
					!back[v] || back[v].some((c) => consonants.includes(c))
				const validFront =
					!front[v] || front[v].some((c) => consonants.includes(c))
				return validBack || validFront || diphthongRules.end.includes(v)
			}),
		)
	return {
		A: validDiphthong(["ae", "ai", "ao", "au"]),
		E: validDiphthong(["ea", "ei", "eo", "eu"]),
		I: validDiphthong(["ia", "ie", "io", "iu"]),
		O: validDiphthong(["oa", "oe", "oi", "ou"]),
		U: validDiphthong(["ua", "ue", "ui", "uo"]),
		Y: validDiphthong(["ya", "ye", "yo", "yu"]),
	}
}

const buildBasicVowels = (params: {
	ending: PhonemeCatalog
	dice: LanguageRng
}) => {
	const vowelCount = 3
	const i = params.dice.weightedChoice([
		{ v: "i", w: 0.9 },
		{ v: "y", w: 0.1 },
	])
	const required = ["a"]
	if (params.ending === PhonemeCatalog.MIDDLE_VOWEL) {
		required.push(params.dice.choice(["o", "u"]))
	}
	const optional = ["e", i, "o", "u", "a"].filter((v) => !required.includes(v))
	return params.dice
		.sample(optional, vowelCount - required.length)
		.concat(required)
}

const buildComplexVowels = (params: {
	consonants: string[]
	vowels: string[]
	stops: number
	exoticCons: boolean
	dice: LanguageRng
}) => {
	const { vowels, consonants, exoticCons, stops, dice } = params
	const doubles = {
		A: "aa",
		E: "ee",
		I: "ii",
		O: "oo",
		U: "uu",
		Y: "i",
	}
	const vowelOrthography: Record<string, string> = dice.weightedChoice([
		{ v: doubles, w: 0.1 },
		{ v: diphthongs({ vowels, consonants, dice }), w: 0.5 },
		{ v: stops > 0 || exoticCons ? basicVowels : exoticVowels(dice), w: 0.4 },
	])
	const specialVowels = dice
		.sample(
			["A", "E", "I", "O", "U", "Y"].filter((v) =>
				vowels.includes(v.toLowerCase()),
			),
			3,
		)
		.map((v) => vowelOrthography[v])
		.filter((v) => v)
	const allVowels = dice.random > 0.9 ? vowels : specialVowels.concat(vowels)
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

export const VOWELS = {
	buildBasicVowels,
	buildComplexVowels,
}

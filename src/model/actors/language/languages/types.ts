/* eslint-disable no-unused-vars */
import type { Dice } from "../../../utilities/dice"
import { WeightedDistribution } from "../../../utilities/dice/types"
import { Gender } from "../../types"

export const PhonemeCatalog = {
	START_CONSONANT: "B",
	MIDDLE_CONSONANT: "C",
	END_CONSONANT: "F",
	START_VOWEL: "A",
	FRONT_VOWEL: "E",
	MIDDLE_VOWEL: "V",
	BACK_VOWEL: "O",
	END_VOWEL: "L",
} as const

// eslint-disable-next-line @typescript-eslint/no-redeclare
export type PhonemeCatalog =
	(typeof PhonemeCatalog)[keyof typeof PhonemeCatalog]

export const STOP_CHAR = "ʔ"

export type PhonemeClass =
	| "nasal"
	| "liquid"
	| "sibilant"
	| "guttural"
	| "plosive"
	| "airy"
export type SyllableWeight = "light" | "medium" | "heavy"
export type OrthoStyle = "standard" | "hacek" | "tilde" | "acute" | "circumflex"

type PhonemeLookup = Record<PhonemeCatalog, WeightedDistribution<string>>

export interface Cluster {
	phonemes: PhonemeLookup
	patterns: Record<string, string>
	key: string
	ending: string | undefined
	stopChance: number
	len: number
	variation: number
	morphemes: Record<string, string[]>
	newSyl: string
	longNames: number
}

interface Surnames {
	// patronymic surnames
	patronymic: boolean
	// patronymic suffix
	suffix: Record<Gender, string[]>
	// epithet prefixes to be used to construct descriptive bynames - i.e 'the wise'
	epithets: string[]
}

export interface Language {
	// chance to pick patterns with stop letters
	stop: string
	stopChance: number
	// sound sets
	basePhonemes: Record<PhonemeCatalog, string[]>
	phonemes: PhonemeLookup
	vowels: string[]
	diphthongs: string[]
	digraphs: string[]
	// word clusters: each cluster has similar words
	clusters: Record<string, Cluster>
	// general ending pattern for words
	ending: PhonemeCatalog
	consonantChance: number // female names
	// surname rules
	surnames: Surnames
	// chance to add an article to settlement names
	articleChance: number
	// predefined words
	predefined: Record<string, string[]>
	// sonic character
	phonemeClass: PhonemeClass
	syllableWeight: SyllableWeight
	orthoStyle: OrthoStyle
	// per-language RNG â€” independent of the world dice
	dice: Dice
}

interface VowelRules {
	front: Record<string, string[]>
	back: Record<string, string[]>
}
// best effort
export const vowelRules: VowelRules = {
	back: {
		ai: ["n", "r"],
		au: ["ng", "g", "r", "s", "x", "tl"],
		eo: ["n", "s", "ss", "v"],
		éo: ["n", "s", "ss", "v"],
		eu: ["s", "x"],
		ia: ["l", "n", "s", "ss", "x"],
		ía: ["l", "n", "s", "ss", "x"],
		ya: ["l", "n", "s", "ss", "x"],
		ie: ["l", "m", "n", "v"],
		ye: ["l", "m", "n", "v"],
		io: ["n", "s", "ss"],
		ío: ["n", "s", "ss"],
		yo: ["n", "s", "ss"],
		iu: ["s", "m"],
		yu: ["s", "m"],
		ou: ["s", "rg", "x"],
		ua: ["l", "n", "r"],
		ue: ["l", "n"],
		ui: ["g", "l", "k", "n", "ng", "q", "r", "t"],
	},
	front: {
		ai: [
			"b",
			"c",
			"j",
			"k",
			"m",
			"n",
			"p",
			"q",
			"s",
			"t",
			"ch",
			"sh",
			"th",
			"x",
			"z",
		],
		ao: [
			"b",
			"ch",
			"g",
			"l",
			"m",
			"p",
			"x",
			"y",
			"zh",
			"z",
			"t",
			"s",
			"sh",
			"ch",
		],
		āo: [
			"b",
			"ch",
			"g",
			"l",
			"m",
			"p",
			"x",
			"y",
			"zh",
			"z",
			"t",
			"s",
			"sh",
			"ch",
		],
		au: [
			"b",
			"br",
			"g",
			"h",
			"j",
			"l",
			"m",
			"p",
			"r",
			"s",
			"t",
			"v",
			"x",
			"ch",
			"zh",
			"y",
		],
		ei: ["h", "l", "r", "w"],
		eo: ["g", "h", "j", "l", "s", "th", "sh", "y"],
		éo: ["g", "h", "j", "l", "s", "th", "sh", "y"],
		ia: ["l", "t"],
		iu: ["l"],
		ou: ["c", "h"],
		uo: ["l", "zh"],
		yo: ["h", "k"],
		yu: ["r"],
	},
}

export interface WordParams {
	lang: Language
	key: string
	len?: number
	ending?: string
	variation?: number
	repeat?: boolean
	stopChance?: number
}

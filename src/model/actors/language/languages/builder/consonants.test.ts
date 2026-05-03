import { describe, expect, it } from "vitest"
import type { LanguageRng, WeightedValue } from "../rng"
import { PhonemeCatalog, type PhonemeClass } from "../types"
import { buildConsonants } from "./consonants"

function createDice(
	weightedChoices: unknown[],
	phonemeClass: PhonemeClass = "sibilant",
): LanguageRng {
	const queue = [...weightedChoices]
	const preferred = [
		"ʃ",
		"ʧ",
		"ʒ",
		"ð",
		"ŋ",
		"n",
		"g",
		"h",
		"r",
		"j",
		"k",
		"q",
		"x",
		"ch",
		"sh",
		"cl",
		"nt",
	]

	return {
		get random() {
			return 0.5
		},
		uniform(min = 0, max = 1) {
			return (min + max) / 2
		},
		randint(min: number, _max: number) {
			return min
		},
		choice<T>(arr: readonly T[]) {
			return (arr.includes(phonemeClass as T) ? phonemeClass : arr[0]) as T
		},
		weightedChoice<T>(arr: readonly WeightedValue<T>[]) {
			const next = queue.shift()
			if (next !== undefined && arr.some((entry) => entry.v === next)) {
				return next as T
			}
			return arr[0]?.v as T
		},
		shuffle<T>(arr: readonly T[]) {
			return [...arr]
		},
		sample<T>(arr: readonly T[], count: number) {
			const prioritized = preferred.filter((value) => arr.includes(value as T))
			const rest = arr.filter((value) => !prioritized.includes(value as string))
			return [...prioritized, ...rest].slice(0, count) as T[]
		},
		weightedSample<T>(
			arr: readonly WeightedValue<T>[],
			count: number,
			_unique?: boolean,
		) {
			return arr.slice(0, count).map(({ v }) => v)
		},
	}
}

describe("buildConsonants", () => {
	it("applies acute orthography extras when palatalized forms are selected", () => {
		const result = buildConsonants({
			ending: PhonemeCatalog.MIDDLE_CONSONANT,
			vowels: ["a", "e"],
			phonemeClass: "sibilant",
			secondaryPhonemeClass: null,
			phonotacticStyle: "balanced",
			dice: createDice(["acute", true, "đ", "ńg"]),
		})
		const flattened = Object.values(result.consonantPhonemes).flat()

		expect(result.orthoStyle).toBe("acute")
		expect(result.diacriticConsonants).toBe(true)
		expect(flattened).toEqual(
			expect.arrayContaining(["ń", "ńg", "đ", "ś", "ć", "ź"]),
		)
	})

	it("uses tilde orthography for nasal and digraph-heavy consonants", () => {
		const result = buildConsonants({
			ending: PhonemeCatalog.END_CONSONANT,
			vowels: ["a", "o", "u"],
			phonemeClass: "nasal",
			secondaryPhonemeClass: null,
			phonotacticStyle: "balanced",
			dice: createDice(["tilde", "dh", "x", "q"], "nasal"),
		})
		const flattened = Object.values(result.consonantPhonemes).flat()

		expect(result.orthoStyle).toBe("tilde")
		expect(result.diacriticConsonants).toBe(true)
		expect(flattened).toEqual(
			expect.arrayContaining(["ñ", "dh", "x", "q", "zh"]),
		)
	})

	it("supports circumflex and hacek orthography variants with optional extras", () => {
		const circumflex = buildConsonants({
			ending: PhonemeCatalog.MIDDLE_CONSONANT,
			vowels: ["a", "e"],
			phonemeClass: "guttural",
			secondaryPhonemeClass: null,
			phonotacticStyle: "balanced",
			dice: createDice(["circumflex", "h", "ĝ", "ĝ"]),
		})
		const hacek = buildConsonants({
			ending: PhonemeCatalog.START_CONSONANT,
			vowels: ["a", "e"],
			phonemeClass: "liquid",
			secondaryPhonemeClass: null,
			phonotacticStyle: "balanced",
			dice: createDice(["hacek", "r", "đ"]),
		})

		expect(Object.values(circumflex.consonantPhonemes).flat()).toEqual(
			expect.arrayContaining(["ŝ", "ĉ", "ĵ", "ĥ"]),
		)
		expect(Object.values(hacek.consonantPhonemes).flat()).toEqual(
			expect.arrayContaining(["š", "č", "ž", "ř"]),
		)
		expect(circumflex.diacriticConsonants).toBe(true)
		expect(hacek.diacriticConsonants).toBe(true)
	})

	it("keeps standard orthography digraphs and avoids y when y is already a vowel", () => {
		const result = buildConsonants({
			ending: PhonemeCatalog.MIDDLE_CONSONANT,
			vowels: ["a", "y"],
			phonemeClass: "airy",
			secondaryPhonemeClass: null,
			phonotacticStyle: "balanced",
			dice: createDice(["standard", "j", "x", "q"], "airy"),
		})
		const flattened = Object.values(result.consonantPhonemes).flat()

		expect(result.orthoStyle).toBe("standard")
		expect(result.diacriticConsonants).toBe(false)
		expect(flattened).toEqual(expect.arrayContaining(["ng", "th", "x", "q"]))
		expect(flattened).not.toContain("y")
	})

	it("skips optional acute and hacek extras when they are not selected", () => {
		const acute = buildConsonants({
			ending: PhonemeCatalog.MIDDLE_CONSONANT,
			vowels: ["a", "e"],
			phonemeClass: "plosive",
			secondaryPhonemeClass: null,
			phonotacticStyle: "balanced",
			dice: createDice(["acute", false, "dh", "ng"], "plosive"),
		})
		const hacek = buildConsonants({
			ending: PhonemeCatalog.END_CONSONANT,
			vowels: ["a", "o"],
			phonemeClass: "liquid",
			secondaryPhonemeClass: null,
			phonotacticStyle: "balanced",
			dice: createDice(["hacek", "", "dh"], "liquid"),
		})

		expect(Object.values(acute.consonantPhonemes).flat()).not.toContain("ń")
		expect(Object.values(hacek.consonantPhonemes).flat()).not.toEqual(
			expect.arrayContaining(["ř", "ň", "ď"]),
		)
	})

	it("adds the circumflex g extra when that branch is selected", () => {
		const result = buildConsonants({
			ending: PhonemeCatalog.MIDDLE_CONSONANT,
			vowels: ["a", "e"],
			phonemeClass: "guttural",
			secondaryPhonemeClass: null,
			phonotacticStyle: "balanced",
			dice: createDice(["circumflex", "g", "ĝ", "dh"], "guttural"),
		})

		expect(Object.values(result.consonantPhonemes).flat()).toContain("ĝ")
	})

	it("supports germanic orthography and blended consonant colors", () => {
		const result = buildConsonants({
			ending: PhonemeCatalog.MIDDLE_CONSONANT,
			vowels: ["a", "o", "u"],
			phonemeClass: "guttural",
			secondaryPhonemeClass: "liquid",
			phonotacticStyle: "closed",
			dice: createDice(["germanic", "d", "sch", "tsch"], "guttural"),
		})

		expect(result.orthoStyle).toBe("germanic")
		expect(result.diacriticConsonants).toBe(false)
		expect(Object.values(result.consonantPhonemes).flat()).toEqual(
			expect.arrayContaining(["ng", "d", "sch", "tsch"]),
		)
	})

	it("keeps open-style inventories away from dense lead clusters", () => {
		const result = buildConsonants({
			ending: PhonemeCatalog.MIDDLE_VOWEL,
			vowels: ["a", "e", "i"],
			phonemeClass: "sibilant",
			secondaryPhonemeClass: null,
			phonotacticStyle: "open",
			dice: createDice(["standard", "j", "sh", "ch"], "sibilant"),
		})

		expect(
			Math.max(
				...result.consonantPhonemes[PhonemeCatalog.START_CONSONANT].map(
					(value) => value.length,
				),
			),
		).toBeLessThanOrEqual(2)
	})
})

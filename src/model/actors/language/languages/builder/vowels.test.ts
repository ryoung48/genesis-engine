import { describe, expect, it } from "vitest"
import type { LanguageRng, WeightedValue } from "../rng"
import { PhonemeCatalog } from "../types"
import { buildBasicVowels, buildComplexVowels } from "./vowels"

function createDice(params?: {
	random?: number
	choices?: unknown[]
	weightedChoices?: unknown[]
	randint?: number
	samples?: string[][]
}): LanguageRng {
	const choiceQueue = [...(params?.choices ?? [])]
	const weightedQueue = [...(params?.weightedChoices ?? [])]
	const sampleQueue = [...(params?.samples ?? [])]

	return {
		get random() {
			return params?.random ?? 0.5
		},
		uniform(min = 0, max = 1) {
			return (min + max) / 2
		},
		randint(min: number, _max: number) {
			return params?.randint ?? min
		},
		choice<T>(arr: readonly T[]) {
			const next = choiceQueue.shift()
			if (typeof next === "number" && arr[next] !== undefined) {
				return arr[next] as T
			}
			if (next !== undefined && arr.includes(next as T)) return next as T
			return arr[0] as T
		},
		weightedChoice<T>(arr: readonly WeightedValue<T>[]) {
			const next = weightedQueue.shift()
			if (typeof next === "number" && arr[next] !== undefined) {
				return arr[next]!.v as T
			}
			if (next !== undefined && arr.some((entry) => entry.v === next)) {
				return next as T
			}
			return arr[0]?.v as T
		},
		shuffle<T>(arr: readonly T[]) {
			return [...arr]
		},
		sample<T>(arr: readonly T[], count: number) {
			const next = sampleQueue.shift()
			if (next) return next.slice(0, count) as T[]
			return [...arr].slice(0, count)
		},
		weightedSample<T>(arr: readonly WeightedValue<T>[], count: number) {
			return arr.slice(0, count).map(({ v }) => v)
		},
	}
}

describe("vowel builders", () => {
	it("keeps required vowels and adds an extra back vowel for vowel endings", () => {
		const vowels = buildBasicVowels({
			ending: PhonemeCatalog.MIDDLE_VOWEL,
			phonotacticStyle: "balanced",
			dice: createDice({
				choices: ["u"],
				weightedChoices: ["y"],
				randint: 3,
				samples: [["e"]],
			}),
		})

		expect(vowels).toEqual(["e", "a", "u"])
	})

	it("builds exotic vowel spellings when stops and diacritics allow them", () => {
		const result = buildComplexVowels({
			consonants: ["r", "f", "h"],
			vowels: ["a", "e", "i"],
			stops: 0,
			ending: PhonemeCatalog.MIDDLE_CONSONANT,
			phonotacticStyle: "balanced",
			dice: createDice({
				weightedChoices: [2],
				choices: [2],
				samples: [["A", "E", "I"]],
			}),
		})

		expect(result.uniqueVowels).toHaveLength(6)
		expect(
			result.uniqueVowels
				.slice(0, 3)
				.some((value) => !["a", "e", "i"].includes(value)),
		).toBe(true)
		expect(result.vowelPhonemes[PhonemeCatalog.FRONT_VOWEL]).toEqual(
			expect.arrayContaining(["a", "e", "i"]),
		)
		expect(result.vowelPhonemes[PhonemeCatalog.END_VOWEL]).toEqual(
			expect.arrayContaining(["a", "e", "i"]),
		)
		expect(result.uniqueVowels).not.toEqual(
			expect.arrayContaining(["aä", "aë", "éo", "oö", "uü"]),
		)
	})

	it("falls back to the base vowels when stops block exotic spellings", () => {
		const result = buildComplexVowels({
			consonants: ["n"],
			vowels: ["a", "o", "u"],
			stops: 1,
			ending: PhonemeCatalog.END_CONSONANT,
			phonotacticStyle: "balanced",
			diacriticConsonants: true,
			dice: createDice({
				random: 0.95,
				weightedChoices: [2],
				samples: [["A", "O", "U"]],
			}),
		})

		expect(result.uniqueVowels).toEqual(["a", "o", "u"])
		expect(result.vowelPhonemes[PhonemeCatalog.START_VOWEL]).toEqual([
			"a",
			"o",
			"u",
		])
		expect(result.vowelPhonemes[PhonemeCatalog.BACK_VOWEL]).toEqual([
			"a",
			"o",
			"u",
		])
	})

	it("reuses available diphthongs when none are compatible with the consonants", () => {
		const result = buildComplexVowels({
			consonants: [],
			vowels: ["i", "u"],
			stops: 0,
			ending: PhonemeCatalog.MIDDLE_CONSONANT,
			phonotacticStyle: "balanced",
			dice: createDice({
				weightedChoices: [1],
				samples: [["I"]],
			}),
		})

		expect(result.uniqueVowels).toEqual(["iu", "i", "u"])
	})
})

import { describe, expect, it } from "vitest"
import type { LanguageRng, WeightedValue } from "../rng"
import { PhonemeCatalog } from "../types"
import { buildConsonants } from "./consonants"

function createDice(weightedChoices: unknown[], randintValue = 0): LanguageRng {
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
			return Math.max(min, randintValue)
		},
		choice<T>(arr: readonly T[]) {
			return arr[0] as T
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
		weightedSample<T>(arr: readonly WeightedValue<T>[], count: number) {
			return arr.slice(0, count).map(({ v }) => v)
		},
	}
}

describe("buildConsonants", () => {
	it("uses the old default orthography mappings", () => {
		const result = buildConsonants({
			ending: PhonemeCatalog.MIDDLE_CONSONANT,
			vowels: ["a", "e"],
			dice: createDice(["q", "j", "x", "q"]),
			stops: false,
		})
		const flattened = Object.values(result.consonantPhonemes).flat()

		expect(flattened).toEqual(
			expect.arrayContaining(["ng", "th", "x", "sh", "ch", "zh"]),
		)
	})

	it("avoids y as a consonant when y is already a vowel", () => {
		const result = buildConsonants({
			ending: PhonemeCatalog.MIDDLE_CONSONANT,
			vowels: ["a", "y"],
			dice: createDice(["q", "j", "x", "q"]),
			stops: false,
		})
		const flattened = Object.values(result.consonantPhonemes).flat()

		expect(flattened).not.toContain("y")
	})

	it("returns only consonant phoneme maps without orthography metadata", () => {
		const result = buildConsonants({
			ending: PhonemeCatalog.MIDDLE_VOWEL,
			vowels: ["a", "e", "i"],
			dice: createDice(["q", "j", "x", "q"], 3),
			stops: false,
		})

		expect(Object.keys(result)).toEqual(["consonantPhonemes"])
	})
})

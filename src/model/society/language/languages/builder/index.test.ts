import { describe, expect, it } from "vitest"
import { LANGUAGE } from "../index"
import type { LanguageRng, WeightedValue } from "../rng"
import { PhonemeCatalog } from "../types"
import { initClusters, randomizePhonemes, validTerms } from "./index"

function createDice(randomValue: number): LanguageRng {
	return {
		get random() {
			return randomValue
		},
		uniform(min = 0, max = 1) {
			return (min + max) / 2
		},
		randint(min: number, _max: number) {
			return min
		},
		choice<T>(arr: readonly T[]) {
			return arr[0] as T
		},
		weightedChoice<T>(arr: readonly WeightedValue<T>[]) {
			return arr[0]?.v as T
		},
		shuffle<T>(arr: readonly T[]) {
			return [...arr]
		},
		sample<T>(arr: readonly T[], count: number) {
			return [...arr].slice(0, count)
		},
		weightedSample<T>(arr: readonly WeightedValue<T>[], count: number) {
			return arr.slice(0, count).map(({ v }) => v)
		},
	}
}

describe("language builder helpers", () => {
	it("filters candidate terms to the allowed letters", () => {
		expect(validTerms(["ab", "ac", "zz"], ["a", "b", "c"])).toEqual([
			"ab",
			"ac",
		])
	})

	it("normalizes randomized phoneme weights and handles zero-total distributions", () => {
		const zeroWeightLanguage = LANGUAGE.spawn("randomize-zero")
		zeroWeightLanguage.dice = createDice(0)
		zeroWeightLanguage.basePhonemes[PhonemeCatalog.START_CONSONANT] = [
			"b",
			"b",
			"d",
		]
		randomizePhonemes(zeroWeightLanguage)

		expect(
			zeroWeightLanguage.phonemes[PhonemeCatalog.START_CONSONANT],
		).toStrictEqual([
			{ v: "b", w: 0 },
			{ v: "d", w: 0 },
		])

		const weightedLanguage = LANGUAGE.spawn("randomize-weighted")
		weightedLanguage.dice = createDice(0.5)
		weightedLanguage.basePhonemes[PhonemeCatalog.START_CONSONANT] = [
			"b",
			"b",
			"d",
		]
		randomizePhonemes(weightedLanguage)

		expect(
			weightedLanguage.phonemes[PhonemeCatalog.START_CONSONANT],
		).toStrictEqual([
			{ v: "b", w: 2 / 3 },
			{ v: "d", w: 1 / 3 },
		])
	})

	it("builds short clusters for light languages and short surname settings", () => {
		const lang = LANGUAGE.spawn("init-light")
		lang.syllableWeight = "light"
		lang.phonotacticStyle = "balanced"
		lang.surnames.epithets = []

		initClusters({ src: lang, shortFirst: true, shortSurnames: true })

		expect(lang.clusters.settlement.len).toBe(1)
		expect(lang.clusters.wilderness.len).toBe(1)
		expect(lang.clusters.region.len).toBe(2)
		expect(lang.clusters.male.len).toBe(1)
		expect(lang.clusters.female.len).toBe(1)
		expect(lang.clusters.last.len).toBe(1)
		expect(lang.clusters.female.patterns).toBe(lang.clusters.male.patterns)
	})

	it("keeps open light place-name clusters from collapsing into clipped stubs", () => {
		const lang = LANGUAGE.spawn("init-open-light")
		lang.syllableWeight = "light"
		lang.phonotacticStyle = "open"
		lang.surnames.epithets = []

		initClusters({ src: lang, shortFirst: true, shortSurnames: true })

		expect(lang.clusters.settlement.len).toBe(2)
		expect(lang.clusters.wilderness.len).toBe(2)
		expect(lang.clusters.region.len).toBe(2)
		expect(lang.clusters.culture.len).toBe(2)
		expect(lang.clusters.culture.longNames).toBeCloseTo(0.2)
		expect(lang.clusters.male.len).toBe(1)
		expect(lang.clusters.female.len).toBe(1)
	})

	it("uses heavy defaults, epithet surname lengths, and explicit cluster overrides", () => {
		const epithetLang = LANGUAGE.spawn("init-epithet")
		epithetLang.syllableWeight = "heavy"
		epithetLang.surnames.epithets = ["the-wise"]

		initClusters({ src: epithetLang })

		expect(epithetLang.clusters.settlement.len).toBe(2)
		expect(epithetLang.clusters.region.len).toBe(2)
		expect(epithetLang.clusters.region.longNames).toBeCloseTo(0.32)
		expect(epithetLang.clusters.culture.len).toBe(2)
		expect(epithetLang.clusters.culture.longNames).toBeCloseTo(0.38)
		expect(epithetLang.clusters.last.len).toBe(2)

		const overridden = LANGUAGE.spawn("init-overridden")
		overridden.syllableWeight = "heavy"
		overridden.surnames.epithets = []

		initClusters({
			src: overridden,
			clusters: {
				male: { len: 4, long_names: 0.8 },
				female: { len: 5, long_names: 0.6 },
				last: { len: 6, long_names: 0.7 },
			},
		})

		expect(overridden.clusters.male.len).toBe(4)
		expect(overridden.clusters.male.longNames).toBeCloseTo(1.2)
		expect(overridden.clusters.female.len).toBe(5)
		expect(overridden.clusters.female.longNames).toBeCloseTo(0.9)
		expect(overridden.clusters.last.len).toBe(6)
		expect(overridden.clusters.last.longNames).toBe(0.7)
	})
})

import { describe, expect, it } from "vitest"
import { CLUSTER } from "./clusters"
import { LANGUAGE } from "./index"
import type { LanguageRng, WeightedValue } from "./rng"
import { PhonemeCatalog, STOP_CHAR } from "./types"

function weighted(values: string[]) {
	return values.map((v) => ({ v, w: 1 }))
}

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

describe("CLUSTER", () => {
	it("filters female phonemes and uses a fixed stop pattern for hyphenated languages", () => {
		const lang = LANGUAGE.spawn("cluster-female")
		lang.stop = "-"
		lang.phonemes[PhonemeCatalog.BACK_VOWEL] = weighted(["a", "i", "ï", "u"])
		lang.phonemes[PhonemeCatalog.END_CONSONANT] = weighted(["k", "l", "s"])

		const female = CLUSTER.spawn({ src: lang, key: "female" })

		expect(
			female.phonemes[PhonemeCatalog.BACK_VOWEL].map(({ v }) => v),
		).toEqual(["i", "ï"])
		expect(
			female.phonemes[PhonemeCatalog.END_CONSONANT].map(({ v }) => v),
		).toEqual(["l", "s"])
		expect(female.patterns[STOP_CHAR]).toBe(
			`${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.MIDDLE_CONSONANT}`,
		)
	})

	it("returns gender-specific ending vowels and falls back to the base set", () => {
		const lang = LANGUAGE.spawn("cluster-endings")

		const female = CLUSTER.spawn({ src: lang, key: "female" })
		female.phonemes[PhonemeCatalog.END_VOWEL] = weighted(["a", "e", "ie", "oo"])
		expect(CLUSTER.endVowels(female, "l").map(({ v }) => v)).toEqual([
			"a",
			"e",
			"ie",
		])
		expect(CLUSTER.endVowels(female, "r").map(({ v }) => v)).toEqual([
			"a",
			"ie",
		])

		const male = CLUSTER.spawn({ src: lang, key: "male" })
		male.phonemes[PhonemeCatalog.END_VOWEL] = weighted(["a", "o", "u"])
		expect(CLUSTER.endVowels(male, "t").map(({ v }) => v)).toEqual(["o", "u"])

		const generic = CLUSTER.spawn({ src: lang, key: "last" })
		generic.phonemes[PhonemeCatalog.END_VOWEL] = weighted(["a", "o", "u"])
		expect(CLUSTER.endVowels(generic, "t").map(({ v }) => v)).toEqual([
			"a",
			"o",
			"u",
		])
	})

	it("generates title-cased words with inserted stop characters", () => {
		const lang = LANGUAGE.spawn("cluster-word")
		lang.stop = "'"
		lang.dice = createDice(0.9)

		const cluster = CLUSTER.spawn({
			src: lang,
			key: "last",
			len: 2,
			variation: 1,
			ending: PhonemeCatalog.MIDDLE_CONSONANT,
			stopChance: 1,
		})
		cluster.phonemes = {
			[PhonemeCatalog.START_CONSONANT]: weighted(["b"]),
			[PhonemeCatalog.MIDDLE_CONSONANT]: weighted(["b"]),
			[PhonemeCatalog.END_CONSONANT]: weighted(["n"]),
			[PhonemeCatalog.START_VOWEL]: weighted(["a"]),
			[PhonemeCatalog.FRONT_VOWEL]: weighted(["a"]),
			[PhonemeCatalog.MIDDLE_VOWEL]: weighted(["a"]),
			[PhonemeCatalog.BACK_VOWEL]: weighted(["a"]),
			[PhonemeCatalog.END_VOWEL]: weighted(["a"]),
		}

		const word = CLUSTER.word(cluster, lang)

		expect(word).toContain("'")
		expect(word[0]).toBe(word[0]?.toUpperCase())
	})

	it("uses male-only end consonants and back-vowel fallbacks in simple syllables", () => {
		const lang = LANGUAGE.spawn("cluster-male-branches")
		const male = CLUSTER.spawn({ src: lang, key: "male" })
		male.phonemes[PhonemeCatalog.START_VOWEL] = weighted(["i"])
		male.phonemes[PhonemeCatalog.END_CONSONANT] = weighted(["l", "k"])
		male.phonemes[PhonemeCatalog.BACK_VOWEL] = weighted(["i", "a"])

		expect(
			CLUSTER.simple(
				male,
				lang,
				`${PhonemeCatalog.START_VOWEL}${PhonemeCatalog.END_CONSONANT}`,
			),
		).toBe("Ik")
		expect(CLUSTER.simple(male, lang, PhonemeCatalog.BACK_VOWEL)).toBe("A")

		const fallbackMale = CLUSTER.spawn({ src: lang, key: "male" })
		fallbackMale.phonemes[PhonemeCatalog.BACK_VOWEL] = weighted(["i"])
		fallbackMale.phonemes[PhonemeCatalog.END_CONSONANT] = weighted(["l"])
		expect(CLUSTER.simple(fallbackMale, lang, PhonemeCatalog.BACK_VOWEL)).toBe(
			"I",
		)
	})

	it("falls back to the base weighted choice when signature phoneme weights are zero", () => {
		const lang = LANGUAGE.spawn("cluster-zero-signature")
		const cluster = CLUSTER.spawn({ src: lang })
		cluster.signature.preferredPhonemes[PhonemeCatalog.START_VOWEL] = ["a"]
		cluster.signature.phonemeBoost = 2
		cluster.phonemes[PhonemeCatalog.START_VOWEL] = [
			{ v: "a", w: 0 },
			{ v: "e", w: 0 },
		]

		expect(CLUSTER.simple(cluster, lang, PhonemeCatalog.START_VOWEL)).toBe("A")
		expect(cluster.key).toBe("")
	})

	it("uses lighter open templates and denser closed templates", () => {
		const open = LANGUAGE.spawn("cluster-open-patterns")
		open.phonotacticStyle = "open"
		open.dice = createDice(0.5)

		const openCluster = CLUSTER.spawn({ src: open, key: "settlement" })
		expect(openCluster.patterns[PhonemeCatalog.MIDDLE_CONSONANT]).toBe(
			`${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}`,
		)
		expect(openCluster.patterns[PhonemeCatalog.MIDDLE_VOWEL]).toBe(
			`${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.MIDDLE_CONSONANT}`,
		)

		const closed = LANGUAGE.spawn("cluster-closed-patterns")
		closed.phonotacticStyle = "closed"
		closed.dice = createDice(0.5)

		const closedCluster = CLUSTER.spawn({ src: closed, key: "settlement" })
		expect(closedCluster.patterns[PhonemeCatalog.MIDDLE_CONSONANT]).toBe(
			`${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.MIDDLE_CONSONANT}`,
		)
		expect(closedCluster.patterns[PhonemeCatalog.MIDDLE_VOWEL]).toBe(
			`${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.MIDDLE_CONSONANT}`,
		)
	})

	it("filters dense consonant runs out of open-style syllables", () => {
		const lang = LANGUAGE.spawn("cluster-open-pronounceable")
		lang.phonotacticStyle = "open"
		const cluster = CLUSTER.spawn({ src: lang, key: "settlement" })
		cluster.phonemes[PhonemeCatalog.START_CONSONANT] = weighted(["str", "b"])
		cluster.phonemes[PhonemeCatalog.FRONT_VOWEL] = weighted(["a"])

		expect(
			CLUSTER.simple(
				cluster,
				lang,
				`${PhonemeCatalog.START_CONSONANT}${PhonemeCatalog.FRONT_VOWEL}`,
			),
		).toBe("Ba")
	})

	it("recognizes vowel spellings from the shared vowel catalog only", () => {
		expect(CLUSTER.vowel("a")).toBe(true)
		expect(CLUSTER.vowel("ae")).toBe(false)
		expect(CLUSTER.vowel("zz")).toBe(false)
	})
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { CLUSTER } from "./clusters"
import { LANGUAGE } from "./index"
import type { WeightedValue } from "./rng"
import type { Language } from "./types"
import { PhonemeCatalog } from "./types"

afterEach(() => {
	vi.restoreAllMocks()
})

function findSpawnedLanguage(
	label: string,
	predicate: (lang: Language) => boolean,
): Language {
	for (let index = 1; index <= 10000; index++) {
		const lang = LANGUAGE.spawn(index.toString(36))
		if (predicate(lang)) return lang
	}
	throw new Error(`No language matched ${label}`)
}

describe("LANGUAGE", () => {
	it("spawns deterministically for the same seed", () => {
		const a = LANGUAGE.spawn("alpha")
		const b = LANGUAGE.spawn("alpha")

		expect(a.stop).toBe(b.stop)
		expect(a.ending).toBe(b.ending)
		expect(a.vowels).toEqual(b.vowels)
		expect(LANGUAGE.word.simple({ lang: a, key: "region" }).word).toBe(
			LANGUAGE.word.simple({ lang: b, key: "region" }).word,
		)
	})

	it("creates dialects that keep the base language structure", () => {
		const base = LANGUAGE.spawn("beta")
		const dialect = LANGUAGE.dialect(base)

		expect(dialect.ending).toBe(base.ending)
		expect(dialect.stop).toBe(base.stop)
		expect(dialect.stopChance).toBe(base.stopChance)
		expect(dialect.predefined).toEqual(base.predefined)
	})

	it("caches generated clusters for repeated word keys", () => {
		const lang = LANGUAGE.spawn("cluster-cache")
		const spawnSpy = vi.spyOn(CLUSTER, "spawn")

		const first = LANGUAGE.word.simple({
			lang,
			key: "artifact",
			len: 2,
			variation: 1,
		})
		const second = LANGUAGE.word.simple({
			lang,
			key: "artifact",
			len: 4,
			variation: 9,
		})

		expect(first.word.length).toBeGreaterThan(0)
		expect(second.word.length).toBeGreaterThan(0)
		expect(spawnSpy).toHaveBeenCalledTimes(1)
		expect(lang.clusters.artifact).toBeDefined()
	})

	it("maps compatibility aliases onto the older cluster keys", () => {
		const lang = LANGUAGE.spawn("aliased-keys")

		LANGUAGE.word.simple({ lang, key: "person_female" })
		LANGUAGE.word.simple({ lang, key: "female" })
		LANGUAGE.word.simple({ lang, key: "nation" })

		expect(Object.keys(lang.clusters)).toEqual(
			expect.arrayContaining(["female", "region"]),
		)
		expect(Object.keys(lang.clusters)).not.toEqual(
			expect.arrayContaining(["person_female", "nation"]),
		)
	})

	it("keeps slot-based words deterministic for the same seed and slot", () => {
		const a = LANGUAGE.spawn("slot-determinism")
		const b = LANGUAGE.spawn("slot-determinism")

		const firstA = LANGUAGE.word.simple({
			lang: a,
			key: "settlement",
			namespace: "province",
			slot: "province:12",
		})
		const firstB = LANGUAGE.word.simple({
			lang: b,
			key: "settlement",
			namespace: "province",
			slot: "province:12",
		})
		const secondB = LANGUAGE.word.simple({
			lang: b,
			key: "river",
			namespace: "river",
			slot: "river:12",
		})
		const secondA = LANGUAGE.word.simple({
			lang: a,
			key: "river",
			namespace: "river",
			slot: "river:12",
		})

		expect(firstA.word).toBe(firstB.word)
		expect(secondA.word).toBe(secondB.word)
	})

	it("treats unique generation as a direct simple-word call", () => {
		const lang = LANGUAGE.spawn("unique-pass-through")
		const simpleSpy = vi.spyOn(LANGUAGE.word, "simple")

		const word = LANGUAGE.word.unique({ lang, key: "culture" })

		expect(word.word.length).toBeGreaterThan(0)
		expect(simpleSpy).toHaveBeenCalledTimes(1)
	})

	it("drops trailing vowels before choosing a compatible demonym suffix", () => {
		const lang = LANGUAGE.spawn("demonym")
		vi.spyOn(LANGUAGE.word, "unique").mockReturnValue({
			morphemes: ["n", "a", "a"],
			word: "Naa",
		})
		lang.dice = {
			...lang.dice,
			weightedChoice<T>(choices: readonly WeightedValue<T>[]): T {
				expect(choices.find((choice) => choice.v === "an")?.w).toBe(0)
				expect(choices.find((choice) => choice.v === "ian")?.w).toBe(0)
				expect(choices.find((choice) => choice.v === "ish")?.w).toBe(1)
				return choices.find((choice) => choice.v === "ese")!.v
			},
		}

		expect(LANGUAGE.word.demonym(lang)).toBe("Nese")
	})

	it("builds language names with the older suffix table", () => {
		const lang = LANGUAGE.spawn("language-name")
		lang.dice = {
			...lang.dice,
			weightedChoice<T>(choices: readonly WeightedValue<T>[]): T {
				expect(choices.find((choice) => choice.v === "ish")?.w).toBe(1)
				expect(choices.find((choice) => choice.v === "ic")?.w).toBe(0)
				return choices.find((choice) => choice.v === "ese")!.v
			},
		}

		expect(LANGUAGE.word.language(["k", "e", "a"], lang.dice)).toBe("Kese")
	})

	it("raises article chances for apostrophe and hyphen separators", () => {
		const plain = findSpawnedLanguage("plain-stop", (lang) => lang.stop === " ")
		const apostrophe = findSpawnedLanguage(
			"apostrophe-stop",
			(lang) => lang.stop === "'",
		)
		const hyphen = findSpawnedLanguage(
			"hyphen-stop",
			(lang) => lang.stop === "-",
		)

		expect(plain.articleChance).toBeLessThan(0.1)
		expect(apostrophe.articleChance).toBeGreaterThanOrEqual(0.1)
		expect(hyphen.articleChance).toBeGreaterThanOrEqual(0.1)
	})

	it("finds seeds that enable patronymics and both epithet surname styles", () => {
		const patronymic = findSpawnedLanguage(
			"patronymic",
			(lang) =>
				lang.surnames.patronymic && lang.surnames.suffix.male.some(Boolean),
		)
		const dashedEpithet = findSpawnedLanguage(
			"dashed-epithet",
			(lang) =>
				lang.surnames.epithets.length > 0 &&
				lang.surnames.epithets.every((epithet) => epithet.endsWith("-")),
		)
		const initialEpithet = findSpawnedLanguage(
			"initial-epithet",
			(lang) =>
				lang.surnames.epithets.length > 0 &&
				lang.surnames.epithets.every((epithet) => /^[A-Z]'$/.test(epithet)),
		)

		expect(patronymic.stop).toBe(" ")
		expect(patronymic.surnames.suffix.male).toHaveLength(2)
		expect(patronymic.surnames.suffix.female).toHaveLength(2)
		expect(
			patronymic.surnames.suffix.female.every((suffix, index) =>
				suffix.startsWith(patronymic.surnames.suffix.male[index] ?? ""),
			),
		).toBe(true)
		expect(dashedEpithet.stop).toBe(" ")
		expect(
			dashedEpithet.surnames.epithets.some((epithet) => epithet.endsWith("-")),
		).toBe(true)
		expect(initialEpithet.stop).toBe(" ")
		expect(
			initialEpithet.surnames.epithets.every((epithet) =>
				/^[A-Z]'$/.test(epithet),
			),
		).toBe(true)
	})

	it("classifies diphthong extensions and gemination", () => {
		const doubles = LANGUAGE.spawn("classify-doubles")
		doubles.diphthongs = ["aa"]
		doubles.phonemes[PhonemeCatalog.MIDDLE_CONSONANT] = [{ v: "t", w: 1 }]

		const diacritics = LANGUAGE.spawn("classify-diacritics")
		diacritics.diphthongs = ["á"]
		diacritics.phonemes[PhonemeCatalog.MIDDLE_CONSONANT] = [{ v: "tt", w: 1 }]

		const mixed = LANGUAGE.spawn("classify-mixed")
		mixed.diphthongs = ["aa", "á"]
		mixed.phonemes[PhonemeCatalog.MIDDLE_CONSONANT] = [{ v: "nn", w: 1 }]

		expect(LANGUAGE.classify(doubles)).toEqual({
			extType: "doubles",
			hasGemination: false,
		})
		expect(LANGUAGE.classify(diacritics)).toEqual({
			extType: "diacritics",
			hasGemination: true,
		})
		expect(LANGUAGE.classify(mixed)).toEqual({
			extType: "mixed",
			hasGemination: true,
		})
	})

	it("reports null extension when a language stays basic", () => {
		const lang = LANGUAGE.spawn("classify-basic")
		lang.diphthongs = []
		lang.phonemes[PhonemeCatalog.MIDDLE_CONSONANT] = [{ v: "t", w: 1 }]

		expect(LANGUAGE.classify(lang)).toEqual({
			extType: null,
			hasGemination: false,
		})
	})

	it("recognizes front-vowel placeholders only", () => {
		expect(LANGUAGE.vowel(PhonemeCatalog.FRONT_VOWEL)).toBe(true)
		expect(LANGUAGE.vowel("plain-vowel")).toBe(false)
	})
})

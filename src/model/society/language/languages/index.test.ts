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
		expect(a.orthoStyle).toBe(b.orthoStyle)
		expect(a.phonemeClass).toBe(b.phonemeClass)
		expect(a.secondaryPhonemeClass).toBe(b.secondaryPhonemeClass)
		expect(a.syllableWeight).toBe(b.syllableWeight)
		expect(a.phonotacticStyle).toBe(b.phonotacticStyle)
		expect(a.vowels).toEqual(b.vowels)
		expect(LANGUAGE.word.simple({ lang: a, key: "region" }).word).toBe(
			LANGUAGE.word.simple({ lang: b, key: "region" }).word,
		)
	})

	it("creates dialects that keep the base language structure", () => {
		const base = LANGUAGE.spawn("beta")
		const dialect = LANGUAGE.dialect(base)

		expect(dialect.ending).toBe(base.ending)
		expect(dialect.phonemeClass).toBe(base.phonemeClass)
		expect(dialect.secondaryPhonemeClass).toBe(base.secondaryPhonemeClass)
		expect(dialect.syllableWeight).toBe(base.syllableWeight)
		expect(dialect.phonotacticStyle).toBe(base.phonotacticStyle)
		expect(dialect.orthoStyle).toBe(base.orthoStyle)
		expect(dialect.predefined).toEqual(base.predefined)
	})

	it("spawns languages across multiple syllable-weight profiles", () => {
		const light = findSpawnedLanguage(
			"light-syllable-weight",
			(lang) => lang.syllableWeight === "light",
		)
		const heavy = findSpawnedLanguage(
			"heavy-syllable-weight",
			(lang) => lang.syllableWeight === "heavy",
		)

		expect(light.syllableWeight).toBe("light")
		expect(heavy.syllableWeight).toBe("heavy")
		expect(light.syllableWeight).not.toBe(heavy.syllableWeight)
	})

	it("spawns languages across open and closed phonotactic styles", () => {
		const open = findSpawnedLanguage(
			"open-phonotactics",
			(lang) =>
				lang.phonotacticStyle === "open" &&
				lang.ending === PhonemeCatalog.MIDDLE_VOWEL,
		)
		const closed = findSpawnedLanguage(
			"closed-phonotactics",
			(lang) =>
				lang.phonotacticStyle === "closed" &&
				lang.ending === PhonemeCatalog.MIDDLE_CONSONANT,
		)

		expect(open.phonotacticStyle).toBe("open")
		expect(closed.phonotacticStyle).toBe("closed")
		expect(open.ending).toBe(PhonemeCatalog.MIDDLE_VOWEL)
		expect(closed.ending).toBe(PhonemeCatalog.MIDDLE_CONSONANT)
	})

	it("finds a language with a secondary consonant color", () => {
		const blended = findSpawnedLanguage(
			"secondary-phoneme-class",
			(lang) => lang.secondaryPhonemeClass !== null,
		)

		expect(blended.secondaryPhonemeClass).not.toBeNull()
		expect(blended.secondaryPhonemeClass).not.toBe(blended.phonemeClass)
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

	it("retries duplicate unique words until a new spelling appears", () => {
		const lang = LANGUAGE.spawn("unique-retry")
		const simpleSpy = vi.spyOn(LANGUAGE.word, "simple")

		simpleSpy.mockReturnValueOnce({
			morphemes: ["probe"],
			word: "Unique Probe",
		})
		const first = LANGUAGE.word.unique({ lang, key: "culture" })

		simpleSpy
			.mockReturnValueOnce({
				morphemes: ["probe"],
				word: "Unique Probe",
			})
			.mockReturnValueOnce({
				morphemes: ["probe", "two"],
				word: "Unique Probe Two",
			})
		const second = LANGUAGE.word.unique({ lang, key: "culture" })

		expect(first.word).toBe("Unique Probe")
		expect(second.word).toBe("Unique Probe Two")
		expect(simpleSpy).toHaveBeenCalledTimes(3)
	})

	it("derives stable slot-based words independent of call order", () => {
		const a = LANGUAGE.spawn("slot-determinism")
		const b = LANGUAGE.spawn("slot-determinism")

		const firstA = LANGUAGE.word.unique({
			lang: a,
			key: "settlement",
			namespace: "province",
			slot: "province:12",
		})
		const secondA = LANGUAGE.word.unique({
			lang: a,
			key: "river",
			namespace: "river",
			slot: "river:12",
		})
		const firstB = LANGUAGE.word.unique({
			lang: b,
			key: "river",
			namespace: "river",
			slot: "river:12",
		})
		const secondB = LANGUAGE.word.unique({
			lang: b,
			key: "settlement",
			namespace: "province",
			slot: "province:12",
		})

		expect(firstA.word).toBe(secondB.word)
		expect(secondA.word).toBe(firstB.word)
	})

	it("scopes unique word tracking to the language instance instead of global state", () => {
		const first = LANGUAGE.spawn("local-unique")
		const second = LANGUAGE.spawn("local-unique")

		const firstWord = LANGUAGE.word.unique({
			lang: first,
			key: "culture",
			namespace: "culture",
			slot: "culture:1",
		})
		const secondWord = LANGUAGE.word.unique({
			lang: second,
			key: "culture",
			namespace: "culture",
			slot: "culture:1",
		})

		expect(firstWord.word).toBe(secondWord.word)
	})

	it("builds deterministic cluster signatures for the same seed", () => {
		const first = LANGUAGE.spawn("signature-determinism")
		const second = LANGUAGE.spawn("signature-determinism")

		LANGUAGE.word.simple({ lang: first, key: "settlement" })
		LANGUAGE.word.simple({ lang: second, key: "settlement" })

		expect(first.clusterTemplates.settlement.signature).toEqual(
			second.clusterTemplates.settlement.signature,
		)
	})

	it("biases cluster words toward shared signature stems without forcing every word", () => {
		const lang = LANGUAGE.spawn("signature-stems")

		const entries = Array.from({ length: 8 }, () =>
			LANGUAGE.word.simple({ lang, key: "settlement" }),
		)
		const signatureStemSet = new Set(
			Object.values(
				lang.clusterTemplates.settlement.signature.templateStems,
			).flat(),
		)
		const hits = entries.filter((entry) =>
			entry.morphemes.some((morpheme) => signatureStemSet.has(morpheme)),
		).length

		expect(signatureStemSet.size).toBeGreaterThan(0)
		expect(hits).toBeGreaterThan(0)
		expect(hits).toBeLessThan(entries.length)
	})

	it("retries slot-based unique words and caches the accepted variant", () => {
		const lang = LANGUAGE.spawn("slot-unique-retry")
		LANGUAGE.word.simple({ lang, key: "nation" })
		const morphemeSpy = vi.spyOn(CLUSTER, "morphemes")

		morphemeSpy
			.mockReturnValueOnce(["alpha"])
			.mockReturnValueOnce(["alpha"])
			.mockReturnValueOnce(["beta"])

		const first = LANGUAGE.word.unique({
			lang,
			key: "nation",
			namespace: "shared",
			slot: "slot:1",
		})
		const second = LANGUAGE.word.unique({
			lang,
			key: "nation",
			namespace: "shared",
			slot: "slot:2",
		})
		const cached = LANGUAGE.word.unique({
			lang,
			key: "nation",
			namespace: "shared",
			slot: "slot:2",
		})

		expect(first.word).toBe("Alpha")
		expect(second.word).toBe("Beta")
		expect(cached.word).toBe("Beta")
		expect(morphemeSpy).toHaveBeenCalledTimes(3)
	})

	it("returns the fallback slot variant after exhausting collision retries", () => {
		const lang = LANGUAGE.spawn("slot-unique-fallback")
		LANGUAGE.word.simple({ lang, key: "person_male" })
		const morphemeSpy = vi
			.spyOn(CLUSTER, "morphemes")
			.mockReturnValue(["alpha"])

		const first = LANGUAGE.word.unique({
			lang,
			key: "person_male",
			namespace: "shared",
			slot: "slot:1",
		})
		const second = LANGUAGE.word.unique({
			lang,
			key: "person_male",
			namespace: "shared",
			slot: "slot:2",
		})

		expect(first.word).toBe("Alpha")
		expect(second.word).toBe("Alpha")
		expect(morphemeSpy).toHaveBeenCalledTimes(129)
	})

	it("reuses aliased clusters for matching word keys", () => {
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

	it("builds slot-based words through simple generation without an explicit namespace", () => {
		const lang = LANGUAGE.spawn("simple-slot")

		const first = LANGUAGE.word.simple({
			lang,
			key: "nation",
			slot: "region:1",
		})
		const second = LANGUAGE.word.simple({
			lang,
			key: "nation",
			slot: "region:1",
		})

		expect(first.word).toBe(second.word)
		expect(lang.clusterTemplates.region).toBeDefined()
	})

	it("rerolls overly long culture names and keeps the shorter accepted result", () => {
		const lang = LANGUAGE.spawn("culture-length-reroll")
		LANGUAGE.word.simple({ lang, key: "culture" })
		const morphemeSpy = vi
			.spyOn(CLUSTER, "morphemes")
			.mockReturnValueOnce(["Jaea", "xoom", "haal"])
			.mockReturnValueOnce(["Fara"])

		expect(LANGUAGE.word.simple({ lang, key: "culture" }).word).toBe("Fara")
		expect(morphemeSpy).toHaveBeenCalledTimes(2)
	})

	it("rerolls slot-based nation names when the first seeded variant is too long", () => {
		const lang = LANGUAGE.spawn("slot-length-reroll")
		LANGUAGE.word.simple({ lang, key: "nation" })
		const morphemeSpy = vi
			.spyOn(CLUSTER, "morphemes")
			.mockReturnValueOnce(["Tadleshe", "dena", "resh"])
			.mockReturnValueOnce(["Faro"])

		const word = LANGUAGE.word.simple({
			lang,
			key: "nation",
			namespace: "nation",
			slot: "nation:1",
		})

		expect(word.word).toBe("Faro")
		expect(morphemeSpy).toHaveBeenCalledTimes(2)
	})

	it("drops trailing vowels before choosing a compatible demonym suffix", () => {
		const lang = LANGUAGE.spawn("demonym")
		vi.spyOn(LANGUAGE.word, "unique").mockReturnValue({
			morphemes: ["n", "a", "a"],
			word: "Naa",
		})
		lang.dice = {
			...lang.dice,
			choice<T>(choices: readonly T[]): T {
				return choices[Math.min(3, choices.length - 1)]!
			},
			weightedChoice<T>(choices: readonly WeightedValue<T>[]): T {
				expect(choices.find((choice) => choice.v === "an")?.w).toBe(0)
				expect(choices.find((choice) => choice.v === "ian")?.w).toBe(0)
				expect(choices.find((choice) => choice.v === "ish")?.w).toBe(1)
				return choices.find((choice) => choice.v === "ese")!.v
			},
		}

		expect(LANGUAGE.word.demonym(lang)).toBe("Nese")
	})

	it("zeroes conflicting demonym suffix weights for t, d/r, and c/k/q endings", () => {
		const lang = LANGUAGE.spawn("demonym-conflicts")
		const weightedChoiceSpy = vi.fn()

		vi.spyOn(LANGUAGE.word, "unique").mockReturnValue({
			morphemes: ["q", "d", "t", "a"],
			word: "Qdta",
		})
		lang.dice = {
			...lang.dice,
			choice<T>(_choices: readonly T[]): T {
				return 3 as T
			},
			weightedChoice<T>(choices: readonly WeightedValue<T>[]): T {
				const typedChoices = choices as readonly WeightedValue<string>[]
				weightedChoiceSpy(typedChoices)
				expect(typedChoices.find((choice) => choice.v === "ite")?.w).toBe(0)
				expect(typedChoices.find((choice) => choice.v === "iard")?.w).toBe(0)
				expect(typedChoices.find((choice) => choice.v === "ic")?.w).toBe(0)
				return "i" as T
			},
		}

		expect(LANGUAGE.word.demonym(lang)).toBe("Qdti")
		expect(weightedChoiceSpy).toHaveBeenCalledTimes(1)
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

	it("classifies diphthong extensions, orthography, and gemination", () => {
		const doubles = LANGUAGE.spawn("classify-doubles")
		doubles.diphthongs = ["aa"]
		doubles.orthoStyle = "standard"
		doubles.phonemes[PhonemeCatalog.MIDDLE_CONSONANT] = [{ v: "t", w: 1 }]

		const diacritics = LANGUAGE.spawn("classify-diacritics")
		diacritics.diphthongs = ["á"]
		diacritics.orthoStyle = "acute"
		diacritics.phonemes[PhonemeCatalog.MIDDLE_CONSONANT] = [{ v: "tt", w: 1 }]

		const mixed = LANGUAGE.spawn("classify-mixed")
		mixed.diphthongs = ["aa", "á"]
		mixed.orthoStyle = "tilde"
		mixed.phonemes[PhonemeCatalog.MIDDLE_CONSONANT] = [{ v: "nn", w: 1 }]

		expect(LANGUAGE.classify(doubles)).toEqual({
			extType: "doubles",
			orthoStyle: null,
			hasGemination: false,
		})
		expect(LANGUAGE.classify(diacritics)).toEqual({
			extType: "diacritics",
			orthoStyle: "acute",
			hasGemination: true,
		})
		expect(LANGUAGE.classify(mixed)).toEqual({
			extType: "mixed",
			orthoStyle: "tilde",
			hasGemination: true,
		})
	})

	it("reports null extension and orthography when a language stays basic", () => {
		const lang = LANGUAGE.spawn("classify-basic")
		lang.diphthongs = []
		lang.orthoStyle = "standard"
		lang.phonemes[PhonemeCatalog.MIDDLE_CONSONANT] = [{ v: "t", w: 1 }]

		expect(LANGUAGE.classify(lang)).toEqual({
			extType: null,
			orthoStyle: null,
			hasGemination: false,
		})
	})

	it("classifies base single-vowel and mixed-base diphthong extensions", () => {
		const singleBase = LANGUAGE.spawn("classify-single-base")
		singleBase.diphthongs = ["w"]
		singleBase.orthoStyle = "standard"

		const basePair = LANGUAGE.spawn("classify-base-pair")
		basePair.diphthongs = ["ai"]
		basePair.orthoStyle = "standard"

		expect(LANGUAGE.classify(singleBase).extType).toBe("diphthongs")
		expect(LANGUAGE.classify(basePair).extType).toBe("diphthongs")
	})

	it("recognizes front-vowel placeholders only", () => {
		expect(LANGUAGE.vowel(PhonemeCatalog.FRONT_VOWEL)).toBe(true)
		expect(LANGUAGE.vowel("plain-vowel")).toBe(false)
	})
})

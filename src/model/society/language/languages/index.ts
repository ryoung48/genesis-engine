import { capitalize, titleCase } from "@/model/shared/text"
import { initClusters, randomizePhonemes } from "./builder"
import { buildConsonants } from "./builder/consonants"
import { buildBasicVowels, buildComplexVowels } from "./builder/vowels"
import { CLUSTER } from "./clusters"
import { createLanguageRng, type LanguageRng } from "./rng"
import {
	type Cluster,
	Gender,
	Language,
	PhonemeCatalog,
	WordParams,
} from "./types"

const spawn = (seed: string, dice: LanguageRng) => {
	const lang: Language = {
		seed,
		dice,
		stop: " ",
		stopChance: 0,
		basePhonemes: {
			[PhonemeCatalog.START_CONSONANT]: [],
			[PhonemeCatalog.MIDDLE_CONSONANT]: [],
			[PhonemeCatalog.END_CONSONANT]: [],
			[PhonemeCatalog.START_VOWEL]: [],
			[PhonemeCatalog.FRONT_VOWEL]: [],
			[PhonemeCatalog.MIDDLE_VOWEL]: [],
			[PhonemeCatalog.BACK_VOWEL]: [],
			[PhonemeCatalog.END_VOWEL]: [],
		},
		phonemes: {
			[PhonemeCatalog.START_CONSONANT]: [],
			[PhonemeCatalog.MIDDLE_CONSONANT]: [],
			[PhonemeCatalog.END_CONSONANT]: [],
			[PhonemeCatalog.START_VOWEL]: [],
			[PhonemeCatalog.FRONT_VOWEL]: [],
			[PhonemeCatalog.MIDDLE_VOWEL]: [],
			[PhonemeCatalog.BACK_VOWEL]: [],
			[PhonemeCatalog.END_VOWEL]: [],
		},
		vowels: [],
		diphthongs: [],
		digraphs: [],
		clusters: {},
		clusterTemplates: {},
		seenWords: {},
		slotWords: new Map(),
		ending:
			dice.random > 0.15
				? PhonemeCatalog.MIDDLE_CONSONANT
				: PhonemeCatalog.MIDDLE_VOWEL,
		consonantChance: dice.uniform(0.1, 0.4),
		surnames: {
			patronymic: false,
			suffix: {
				male: [""],
				female: [""],
			},
			epithets: [],
		},
		articleChance: dice.uniform(0, 0.05),
		predefined: {},
	}
	return lang
}

const baseVowels = ["a", "e", "i", "o", "u", "y"]
const KEY_ALIASES: Record<string, string> = {
	nation: "region",
	person_female: "female",
	person_male: "male",
}

function normalizeWordKey(key: string): string {
	return KEY_ALIASES[key] ?? key
}

function collectDigraphs(
	consonantPhonemes: Partial<Record<PhonemeCatalog, string[]>>,
): string[] {
	return Array.from(
		new Set(
			Object.values(consonantPhonemes)
				.flatMap((phonemes) => phonemes ?? [])
				.filter(
					(phoneme) =>
						phoneme.length > 1 &&
						!["ng", "str", "th", "sh", "dr", "br"].includes(phoneme),
				),
		),
	)
}

function buildSlotSeed(
	lang: Language,
	key: string,
	namespace: string,
	slot: string,
): string {
	return `${lang.seed}:word:${normalizeWordKey(key)}:${namespace}:${slot}`
}

function spawnCluster(
	lang: Language,
	params: Pick<
		WordParams,
		"key" | "len" | "ending" | "stopChance" | "variation"
	>,
	longNames?: number,
): Cluster {
	return CLUSTER.spawn({
		src: lang,
		key: normalizeWordKey(params.key),
		len: params.len,
		ending: params.ending,
		stopChance: params.stopChance,
		variation: params.variation,
		longNames,
	})
}

function buildSlotWord({
	lang,
	key,
	namespace,
	slot,
	len,
	ending,
	stopChance,
	variation,
	repeat = false,
}: WordParams & {
	namespace: string
	slot: string
}): { morphemes: string[]; word: string } {
	const normalizedKey = normalizeWordKey(key)
	const baseCluster = lang.clusters[normalizedKey]
	const resolvedLen = len ?? baseCluster?.len
	const resolvedEnding = ending ?? baseCluster?.ending ?? lang.ending
	const resolvedStopChance = stopChance ?? baseCluster?.stopChance ?? 0
	const resolvedVariation = variation ?? baseCluster?.variation ?? 10
	const resolvedLongNames = baseCluster?.longNames
	const slotLang: Language = {
		...lang,
		dice: createLanguageRng(
			buildSlotSeed(lang, normalizedKey, namespace, slot),
		),
		clusters: {},
		clusterTemplates: {},
		seenWords: {},
		slotWords: new Map(),
	}
	const cluster = spawnCluster(
		slotLang,
		{
			key: normalizedKey,
			len: resolvedLen,
			ending: resolvedEnding,
			stopChance: resolvedStopChance,
			variation: resolvedVariation,
		},
		resolvedLongNames,
	)
	const morphemes = CLUSTER.morphemes(cluster, slotLang, repeat)
	return { morphemes, word: titleCase(morphemes.join("")) }
}

export const LANGUAGE = {
	word: {
		demonym: (lang: Language) => {
			const { morphemes } = LANGUAGE.word.unique({ lang, key: "culture" })
			const prefix = morphemes.slice(0, -1).join("")
			let index = prefix.length - 1
			while (index >= 0 && CLUSTER.vowel(prefix[index])) {
				index--
			}
			const cleaned = prefix.slice(0, index + 1)
			const suffix = lang.dice.weightedChoice([
				{ v: "an", w: cleaned.includes("n") ? 0 : 1 },
				{ v: "ian", w: cleaned.includes("n") ? 0 : 1 },
				{ v: "ish", w: cleaned.includes("s") ? 0 : 1 },
				{ v: "ite", w: cleaned.includes("t") ? 0 : 1 },
				{
					v: "iard",
					w: cleaned.includes("d") || cleaned.includes("r") ? 0 : 1,
				},
				{
					v: "ic",
					w:
						cleaned.includes("k") ||
						cleaned.includes("c") ||
						cleaned.includes("q")
							? 0
							: 1,
				},
				{ v: "i", w: 1 },
				{ v: "ese", w: 1 },
			])
			return capitalize(cleaned + suffix)
		},
		language: (morphemes: string[], dice: LanguageRng) => {
			const prefix = morphemes.slice(0, -1).join("")
			let index = prefix.length - 1
			while (index >= 0 && CLUSTER.vowel(prefix[index])) {
				index--
			}
			const cleaned = prefix.slice(0, index + 1)
			const suffix = dice.weightedChoice([
				{ v: "an", w: cleaned.includes("n") ? 0 : 1 },
				{ v: "ian", w: cleaned.includes("n") ? 0 : 1 },
				{ v: "ish", w: cleaned.includes("s") ? 0 : 1 },
				{
					v: "ic",
					w:
						cleaned.includes("k") ||
						cleaned.includes("c") ||
						cleaned.includes("q")
							? 0
							: 1,
				},
				{ v: "i", w: 1 },
				{ v: "u", w: 1 },
				{ v: "a", w: 1 },
				{ v: "ese", w: 1 },
			])
			return capitalize(cleaned + suffix)
		},
		firstName: (lang: Language, gender: Gender) =>
			LANGUAGE.word.simple({ lang, key: gender }),
		simple: ({
			lang,
			key,
			namespace,
			slot,
			repeat = false,
			len,
			ending,
			stopChance,
			variation,
		}: WordParams) => {
			const normalizedKey = normalizeWordKey(key)
			if (slot) {
				return buildSlotWord({
					lang,
					key: normalizedKey,
					namespace: namespace ?? normalizedKey,
					slot,
					len,
					ending,
					stopChance,
					variation,
					repeat,
				})
			}
			if (!lang.clusters[normalizedKey]) {
				lang.clusters[normalizedKey] = spawnCluster(lang, {
					key: normalizedKey,
					len,
					ending: ending ?? lang.ending,
					stopChance,
					variation: variation ?? 10,
				})
			}
			const morphemes = CLUSTER.morphemes(
				lang.clusters[normalizedKey],
				lang,
				repeat,
			)
			return { morphemes, word: titleCase(morphemes.join("")) }
		},
		unique: (params: WordParams): { morphemes: string[]; word: string } => {
			return LANGUAGE.word.simple(params)
		},
	},
	spawn: (seed: string) => {
		const lang = spawn(seed, createLanguageRng(seed))
		const dice = lang.dice

		const stop = dice.weightedChoice([
			{ v: " ", w: 0.8 },
			{ v: "'", w: 0.1 },
			{ v: "-", w: 0.1 },
		])
		lang.stop = stop
		const stopChance =
			stop === "'" ? dice.uniform(0.3, 0.6) : stop === "-" ? 1 : 0
		lang.stopChance = stopChance
		if (stop === "'" || stop === "-") {
			lang.articleChance = dice.uniform(0.1, 0.4)
		}

		const vowels = buildBasicVowels({ ending: lang.ending, dice })
		const { consonantPhonemes } = buildConsonants({
			ending: lang.ending,
			vowels,
			dice,
			stops: stop !== " ",
		})
		const exoticCons = ["ñ", "ñg"].some((c) =>
			consonantPhonemes[PhonemeCatalog.MIDDLE_CONSONANT].includes(c),
		)
		const { uniqueVowels, vowelPhonemes } = buildComplexVowels({
			vowels,
			consonants: consonantPhonemes[PhonemeCatalog.END_CONSONANT],
			exoticCons,
			stops: stopChance,
			dice,
		})
		lang.vowels = uniqueVowels
		lang.diphthongs = lang.vowels.filter((v) => !baseVowels.includes(v))
		lang.digraphs = collectDigraphs(consonantPhonemes)
		lang.basePhonemes = { ...consonantPhonemes, ...vowelPhonemes }
		randomizePhonemes(lang)

		const shortSurnames = dice.random > 0.9
		initClusters({
			shortSurnames,
			shortFirst:
				lang.ending === PhonemeCatalog.MIDDLE_VOWEL && dice.random > 0.9,
			src: lang,
		})
		const cluster = CLUSTER.spawn({ src: lang, key: "generic", len: 1 })

		lang.surnames.patronymic =
			stop === " " && !shortSurnames && dice.random > 0.8
		if (lang.surnames.patronymic) {
			const vowels = dice.weightedSample(
				lang.phonemes[PhonemeCatalog.MIDDLE_VOWEL],
				2,
			)
			const start = dice.weightedChoice(
				lang.phonemes[PhonemeCatalog.START_CONSONANT],
			)
			const end = dice.weightedChoice(
				lang.phonemes[PhonemeCatalog.END_CONSONANT],
			)
			const endVowel = dice.weightedChoice(
				CLUSTER.endVowels(lang.clusters.female, end).filter(
					(v: { v: string }) => v.v.length < 2,
				),
			)
			const pattern = vowels.map((v) => `${start}${v}${end}`)
			lang.surnames.suffix = {
				male: pattern.map((p) => `${p}`),
				female: pattern.map((p) => `${p}${endVowel}`),
			}
		}
		if (
			!lang.surnames.patronymic &&
			!shortSurnames &&
			stop === " " &&
			dice.random > 0.8
		) {
			if (dice.random > 0.2) {
				const vowels = dice.weightedSample(
					lang.phonemes[PhonemeCatalog.MIDDLE_VOWEL],
					2,
				)
				const end = dice.weightedChoice(
					lang.phonemes[PhonemeCatalog.END_CONSONANT],
				)
				lang.surnames.epithets = vowels.map((v) => `${v}${end}-`)
			} else {
				const prospects = lang.phonemes[PhonemeCatalog.START_CONSONANT].filter(
					(l) => l.v.length === 1,
				)
				lang.surnames.epithets = dice
					.weightedSample(prospects, 3)
					.map((c) => `${c.toLocaleUpperCase()}'`)
			}
		}

		lang.predefined = {
			the: [
				CLUSTER.simple(
					cluster,
					lang,
					dice.weightedChoice([
						{
							v: `${PhonemeCatalog.START_VOWEL}${PhonemeCatalog.END_CONSONANT}`,
							w: 0.2,
						},
						{
							v: `${PhonemeCatalog.START_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.END_CONSONANT}`,
							w: 0.8,
						},
					]),
				),
			],
			title: [
				CLUSTER.simple(
					cluster,
					lang,
					dice.weightedChoice([
						{
							v: `${PhonemeCatalog.START_VOWEL}${PhonemeCatalog.END_CONSONANT}`,
							w: 0.2,
						},
						{
							v: `${PhonemeCatalog.START_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.END_CONSONANT}`,
							w: 0.8,
						},
					]),
				),
			],
		}
		return lang
	},
	dialect: (base: Language, seed?: number) => {
		const dialectSeed =
			seed == null
				? `${base.seed}:dialect:${base.dice.randint(0, 2147483647)}`
				: `${base.seed}:dialect:${seed}`
		const lang = spawn(dialectSeed, createLanguageRng(dialectSeed))
		lang.ending = base.ending
		lang.stop = base.stop
		lang.stopChance = base.stopChance
		lang.articleChance = base.articleChance
		lang.surnames = { ...base.surnames }
		lang.basePhonemes = { ...base.basePhonemes }
		lang.vowels = [...base.vowels]
		lang.diphthongs = [...base.diphthongs]
		lang.digraphs = [...base.digraphs]
		randomizePhonemes(lang)
		initClusters({ src: lang })
		Object.keys(lang.clusters).forEach((k) => {
			lang.clusters[k].patterns = base.clusters[k].patterns
			lang.clusters[k].stopChance = base.clusters[k].stopChance
			lang.clusters[k].ending = base.clusters[k].ending
			lang.clusters[k].len = base.clusters[k].len
		})
		lang.predefined = { ...base.predefined }
		return lang
	},
	classify: (
		lang: Language,
	): {
		extType: string | null
		hasGemination: boolean
	} => {
		const baseSet = new Set(["a", "e", "i", "o", "u", "y", "w"])
		const isBase = (c: string) => baseSet.has(c)
		const catVowel = (v: string): string => {
			const chars = [...v]
			if (chars.length === 1)
				return isBase(chars[0]) ? "diphthongs" : "diacritics"
			const allBase = chars.every((c) => isBase(c))
			if (allBase) return chars[0] === chars[1] ? "doubles" : "diphthongs"
			return "mixed"
		}
		let extType: string | null = null
		if (lang.diphthongs.length > 0) {
			const cats = new Set(lang.diphthongs.map(catVowel))
			extType = cats.size === 1 ? [...cats][0] : "mixed"
		}
		const hasGemination = lang.phonemes[PhonemeCatalog.MIDDLE_CONSONANT].some(
			({ v }) => v.length >= 2 && v[0] === v[1],
		)
		return {
			extType,
			hasGemination,
		}
	},
	vowel: (vowel: string) => {
		return vowel.includes(PhonemeCatalog.FRONT_VOWEL)
	},
}

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
	OrthoStyle,
	PhonemeCatalog,
	PhonemeClass,
	type PhonotacticStyle,
	SyllableWeight,
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
			dice.random > 0.3
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
		phonemeClass: "nasal" as PhonemeClass,
		secondaryPhonemeClass: null,
		syllableWeight: "medium" as SyllableWeight,
		phonotacticStyle: "balanced" as PhonotacticStyle,
		orthoStyle: "standard" as OrthoStyle,
	}
	return lang
}

const baseVowels = ["a", "e", "i", "o", "u", "y"]
const languageVarietyCache = new WeakMap<
	Language,
	{
		preferredCountScale: number
		leadStemScale: number
		followStemScale: number
		phonemeBoostScale: number
	}
>()

const KEY_ALIASES: Record<string, string> = {
	nation: "region",
	person_female: "female",
	person_male: "male",
}
const SANITY_MAX_WORD_LENGTHS: Partial<Record<string, number>> = {
	culture: 11,
	region: 10,
}
const SANITY_RETRY_ATTEMPTS = 4

const CLUSTER_SIGNATURE_PROFILES: Record<
	string,
	{
		preferredCount: Partial<Record<PhonemeCatalog, number>>
		templateStemCount: number
		leadStemChance: number
		followStemChance: number
		phonemeBoost: number
	}
> = {
	culture: {
		preferredCount: {},
		templateStemCount: 3,
		leadStemChance: 0.65,
		followStemChance: 0.28,
		phonemeBoost: 2.6,
	},
	female: {
		preferredCount: {},
		templateStemCount: 2,
		leadStemChance: 0.55,
		followStemChance: 0.18,
		phonemeBoost: 2.1,
	},
	last: {
		preferredCount: {},
		templateStemCount: 2,
		leadStemChance: 0.45,
		followStemChance: 0.12,
		phonemeBoost: 1.9,
	},
	male: {
		preferredCount: {},
		templateStemCount: 2,
		leadStemChance: 0.55,
		followStemChance: 0.18,
		phonemeBoost: 2.1,
	},
	region: {
		preferredCount: {},
		templateStemCount: 3,
		leadStemChance: 0.65,
		followStemChance: 0.3,
		phonemeBoost: 2.7,
	},
	river: {
		preferredCount: {},
		templateStemCount: 2,
		leadStemChance: 0.55,
		followStemChance: 0.22,
		phonemeBoost: 2.3,
	},
	settlement: {
		preferredCount: {},
		templateStemCount: 3,
		leadStemChance: 0.6,
		followStemChance: 0.22,
		phonemeBoost: 2.35,
	},
	wilderness: {
		preferredCount: {},
		templateStemCount: 2,
		leadStemChance: 0.55,
		followStemChance: 0.22,
		phonemeBoost: 2.3,
	},
}
const CLUSTER_SIGNATURE_PREFERRED_COUNTS: Record<PhonemeCatalog, number> = {
	[PhonemeCatalog.START_CONSONANT]: 3,
	[PhonemeCatalog.MIDDLE_CONSONANT]: 3,
	[PhonemeCatalog.END_CONSONANT]: 2,
	[PhonemeCatalog.START_VOWEL]: 1,
	[PhonemeCatalog.FRONT_VOWEL]: 2,
	[PhonemeCatalog.MIDDLE_VOWEL]: 2,
	[PhonemeCatalog.BACK_VOWEL]: 2,
	[PhonemeCatalog.END_VOWEL]: 1,
}

function normalizeWordKey(key: string): string {
	return KEY_ALIASES[key] ?? key
}

function getSaneLengthLimit(key: string): number | undefined {
	return SANITY_MAX_WORD_LENGTHS[normalizeWordKey(key)]
}

function visibleWordLength(word: string): number {
	return word.replaceAll(/[\s'-]/g, "").length
}

function chooseSaneWordCandidate<T extends { word: string }>(
	maxChars: number | undefined,
	buildCandidate: (attempt: number) => T,
): T {
	const first = buildCandidate(0)
	if (maxChars == null || visibleWordLength(first.word) <= maxChars)
		return first

	let best = first
	for (let attempt = 1; attempt < SANITY_RETRY_ATTEMPTS; attempt++) {
		const candidate = buildCandidate(attempt)
		if (visibleWordLength(candidate.word) < visibleWordLength(best.word)) {
			best = candidate
		}
		if (visibleWordLength(candidate.word) <= maxChars) return candidate
	}

	return best
}

function getClusterSignatureProfile(key: string) {
	return (
		CLUSTER_SIGNATURE_PROFILES[key] ?? {
			preferredCount: {},
			templateStemCount: 2,
			leadStemChance: 0.55,
			followStemChance: 0.18,
			phonemeBoost: 2.1,
		}
	)
}

function getLanguageVarietyProfile(lang: Language) {
	const existing = languageVarietyCache.get(lang)
	if (existing) return existing

	const rng = createLanguageRng(`${lang.seed}:language:variety`)
	const profile = {
		preferredCountScale: rng.uniform(0.7, 1.15),
		leadStemScale: rng.uniform(0.7, 1.05),
		followStemScale: rng.uniform(0.55, 1),
		phonemeBoostScale: rng.uniform(0.7, 1.1),
	}
	languageVarietyCache.set(lang, profile)
	return profile
}

function cloneCluster(cluster: Cluster): Cluster {
	return {
		...cluster,
		patterns: { ...cluster.patterns },
		signature: {
			preferredPhonemes: Object.fromEntries(
				Object.entries(cluster.signature.preferredPhonemes).map(
					([catalog, values]) => [catalog, [...values]],
				),
			),
			templateStems: Object.fromEntries(
				Object.entries(cluster.signature.templateStems).map(
					([template, stems]) => [template, [...stems]],
				),
			),
			templateStemCount: cluster.signature.templateStemCount,
			leadStemChance: cluster.signature.leadStemChance,
			followStemChance: cluster.signature.followStemChance,
			phonemeBoost: cluster.signature.phonemeBoost,
		},
		morphemes: Object.fromEntries(
			Object.entries(cluster.morphemes).map(([template, morphemes]) => [
				template,
				[...morphemes],
			]),
		),
		phonemes: {
			[PhonemeCatalog.START_CONSONANT]: cluster.phonemes[
				PhonemeCatalog.START_CONSONANT
			].map(({ v, w }) => ({ v, w })),
			[PhonemeCatalog.MIDDLE_CONSONANT]: cluster.phonemes[
				PhonemeCatalog.MIDDLE_CONSONANT
			].map(({ v, w }) => ({ v, w })),
			[PhonemeCatalog.END_CONSONANT]: cluster.phonemes[
				PhonemeCatalog.END_CONSONANT
			].map(({ v, w }) => ({ v, w })),
			[PhonemeCatalog.START_VOWEL]: cluster.phonemes[
				PhonemeCatalog.START_VOWEL
			].map(({ v, w }) => ({ v, w })),
			[PhonemeCatalog.FRONT_VOWEL]: cluster.phonemes[
				PhonemeCatalog.FRONT_VOWEL
			].map(({ v, w }) => ({ v, w })),
			[PhonemeCatalog.MIDDLE_VOWEL]: cluster.phonemes[
				PhonemeCatalog.MIDDLE_VOWEL
			].map(({ v, w }) => ({ v, w })),
			[PhonemeCatalog.BACK_VOWEL]: cluster.phonemes[
				PhonemeCatalog.BACK_VOWEL
			].map(({ v, w }) => ({ v, w })),
			[PhonemeCatalog.END_VOWEL]: cluster.phonemes[
				PhonemeCatalog.END_VOWEL
			].map(({ v, w }) => ({ v, w })),
		},
	}
}

function assignClusterSignature(
	cluster: Cluster,
	lang: Language,
	key: string,
): void {
	const profile = getClusterSignatureProfile(key)
	const languageVariety = getLanguageVarietyProfile(lang)
	const rng = createLanguageRng(`${lang.seed}:cluster:${key}:signature`)
	const preferredPhonemes: Cluster["signature"]["preferredPhonemes"] = {}

	for (const catalog of Object.values(PhonemeCatalog)) {
		const pool = cluster.phonemes[catalog]
		const preferredCount = Math.min(
			pool.length,
			Math.max(
				1,
				Math.round(
					(profile.preferredCount[catalog] ??
						CLUSTER_SIGNATURE_PREFERRED_COUNTS[catalog]) *
						languageVariety.preferredCountScale,
				),
			),
		)
		if (preferredCount <= 0) continue
		preferredPhonemes[catalog] = rng.weightedSample(pool, preferredCount)
	}

	cluster.signature = {
		preferredPhonemes,
		templateStems: {},
		templateStemCount: Math.max(1, profile.templateStemCount),
		leadStemChance: Math.max(
			0.3,
			Math.min(0.8, profile.leadStemChance * languageVariety.leadStemScale),
		),
		followStemChance: Math.max(
			0.05,
			Math.min(
				0.35,
				profile.followStemChance * languageVariety.followStemScale,
			),
		),
		phonemeBoost: Number(
			Math.max(
				1.25,
				profile.phonemeBoost * languageVariety.phonemeBoostScale,
			).toFixed(2),
		),
	}
}

function finalizeClusterSignatureStems(
	cluster: Cluster,
	lang: Language,
	key: string,
): void {
	const rng = createLanguageRng(`${lang.seed}:cluster:${key}:stems`)
	const warmSource: Language = {
		...lang,
		dice: createLanguageRng(`${lang.seed}:cluster:${key}:stems:warm`),
		clusters: {
			[key]: cluster,
		},
		clusterTemplates: {
			[key]: cluster,
		},
		seenWords: {},
		slotWords: new Map(),
	}

	for (const [template, morphemes] of Object.entries(cluster.morphemes)) {
		let concrete = Array.from(
			new Set(morphemes.filter((morpheme) => morpheme !== cluster.newSyl)),
		)
		for (
			let attempts = 0;
			concrete.length === 0 && attempts < cluster.variation;
			attempts++
		) {
			CLUSTER.morphemes(cluster, warmSource, true)
			concrete = Array.from(
				new Set(
					(cluster.morphemes[template] ?? []).filter(
						(morpheme) => morpheme !== cluster.newSyl,
					),
				),
			)
		}
		if (concrete.length === 0) continue
		cluster.signature.templateStems[template] =
			concrete.length <= cluster.signature.templateStemCount
				? concrete
				: rng.sample(concrete, cluster.signature.templateStemCount)
	}
}

function hasInitializedClusterSignature(cluster: Cluster | undefined): boolean {
	return Boolean(
		cluster &&
			cluster.signature.templateStemCount > 0 &&
			Object.keys(cluster.signature.preferredPhonemes).length > 0 &&
			Object.keys(cluster.signature.templateStems).length > 0,
	)
}

function primeClusterTemplate(
	cluster: Cluster,
	lang: Language,
	key: string,
): Cluster {
	assignClusterSignature(cluster, lang, key)
	const warmCount = Math.max(
		cluster.variation + cluster.signature.templateStemCount,
		8,
	)
	for (let index = 0; index < warmCount; index++) {
		CLUSTER.morphemes(cluster, lang, index < cluster.variation)
	}
	finalizeClusterSignatureStems(cluster, lang, key)
	return cluster
}

function buildClusterTemplate(lang: Language, params: WordParams): Cluster {
	const normalizedKey = normalizeWordKey(params.key)
	const clusterSource: Language = {
		...lang,
		dice: createLanguageRng(`${lang.seed}:cluster:${normalizedKey}:template`),
		clusters: {},
		clusterTemplates: {},
		seenWords: {},
		slotWords: new Map(),
	}

	const template = CLUSTER.spawn({
		src: clusterSource,
		key: normalizedKey,
		len: params.len,
		ending: params.ending ?? lang.ending,
		stopChance: params.stopChance,
		variation: params.variation,
	})
	return primeClusterTemplate(template, clusterSource, normalizedKey)
}

function ensureClusterTemplate(lang: Language, params: WordParams): Cluster {
	const normalizedKey = normalizeWordKey(params.key)
	let template = lang.clusterTemplates[normalizedKey]
	if (!hasInitializedClusterSignature(template)) {
		template = template
			? primeClusterTemplate(cloneCluster(template), lang, normalizedKey)
			: buildClusterTemplate(lang, params)
		lang.clusterTemplates[normalizedKey] = template
	}
	return template
}

function ensureCluster(lang: Language, params: WordParams): Cluster {
	const normalizedKey = normalizeWordKey(params.key)
	let cluster = lang.clusters[normalizedKey]
	if (!hasInitializedClusterSignature(cluster)) {
		cluster = cloneCluster(ensureClusterTemplate(lang, params))
		lang.clusters[normalizedKey] = cluster
	}
	return cluster
}

function buildSlotSeed(
	lang: Language,
	key: string,
	namespace: string,
	slot: string,
	variant = 0,
): string {
	return `${lang.seed}:word:${normalizeWordKey(key)}:${namespace}:${slot}:${variant.toString(36)}`
}

function buildSlotCacheKey(
	key: string,
	namespace: string,
	slot: string,
): string {
	return `${normalizeWordKey(key)}|${namespace}|${slot}`
}

function buildRawSlotWord(
	params: WordParams & {
		namespace: string
		slot: string
		variant?: number
		repeat?: boolean
	},
): { morphemes: string[]; word: string } {
	const { lang, key, namespace, slot, variant = 0, repeat = false } = params
	const normalizedKey = normalizeWordKey(key)
	const template = ensureClusterTemplate(lang, params)
	const slotLang: Language = {
		...lang,
		dice: createLanguageRng(
			buildSlotSeed(lang, normalizedKey, namespace, slot, variant),
		),
		clusters: {
			[normalizedKey]: cloneCluster(template),
		},
		clusterTemplates: {
			[normalizedKey]: template,
		},
		seenWords: {},
		slotWords: new Map(),
	}
	const morphemes = CLUSTER.morphemes(
		slotLang.clusters[normalizedKey],
		slotLang,
		repeat,
	)
	return { morphemes, word: titleCase(morphemes.join("")) }
}

function buildSlotWord(
	params: WordParams & {
		namespace: string
		slot: string
		variant?: number
		repeat?: boolean
	},
): { morphemes: string[]; word: string } {
	const maxChars = getSaneLengthLimit(params.key)
	const variantBase = (params.variant ?? 0) * SANITY_RETRY_ATTEMPTS
	return chooseSaneWordCandidate(maxChars, (attempt) =>
		buildRawSlotWord({
			...params,
			variant: variantBase + attempt,
			repeat: params.repeat || attempt > 0,
		}),
	)
}

function getNamespaceSeenWords(lang: Language, namespace: string): Set<string> {
	const seen = lang.seenWords[namespace]
	if (seen) return seen
	const created = new Set<string>()
	lang.seenWords[namespace] = created
	return created
}

function collectDigraphs(
	consonantPhonemes: Partial<Record<PhonemeCatalog, string[]>>,
): string[] {
	const seen = new Set<string>()
	const result: string[] = []

	for (const phonemes of Object.values(consonantPhonemes)) {
		for (const phoneme of phonemes) {
			if (
				phoneme.length <= 1 ||
				["ng", "str", "th", "sh", "dr", "br"].includes(phoneme) ||
				seen.has(phoneme)
			) {
				continue
			}
			seen.add(phoneme)
			result.push(phoneme)
		}
	}

	return result
}

export const LANGUAGE = {
	word: {
		demonym: (lang: Language) => {
			const { morphemes } = LANGUAGE.word.unique({ lang, key: "culture" })
			const prefix = morphemes.slice(0, lang.dice.choice([2, 3])).join("")
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
		firstName: (lang: Language, gender: Gender) =>
			LANGUAGE.word.simple({ lang, key: gender }),
		simple: ({
			lang,
			key,
			namespace,
			slot,
			repeat = false,
			len,
			ending = lang.ending,
			stopChance,
			variation = 10,
		}: WordParams) => {
			if (slot) {
				return buildSlotWord({
					lang,
					key,
					namespace: namespace ?? normalizeWordKey(key),
					slot,
					len,
					ending,
					stopChance,
					variation,
				})
			}
			const cluster = ensureCluster(lang, {
				lang,
				key,
				len,
				ending,
				stopChance,
				variation,
			})
			return chooseSaneWordCandidate(getSaneLengthLimit(key), (attempt) => {
				const morphemes = CLUSTER.morphemes(
					cluster,
					lang,
					repeat || attempt > 0,
				)
				return { morphemes, word: titleCase(morphemes.join("")) }
			})
		},
		unique: (params: WordParams): { morphemes: string[]; word: string } => {
			const namespace = params.namespace ?? normalizeWordKey(params.key)
			if (params.slot) {
				const cacheKey = buildSlotCacheKey(params.key, namespace, params.slot)
				const cached = params.lang.slotWords.get(cacheKey)
				if (cached) return cached

				const seenWords = getNamespaceSeenWords(params.lang, namespace)
				let fallbackCandidate: { morphemes: string[]; word: string } | undefined
				for (let variant = 0; variant < 128; variant++) {
					const candidate = buildSlotWord({
						...params,
						namespace,
						slot: params.slot,
						variant,
						repeat: variant > 0,
					})
					fallbackCandidate ??= candidate
					if (seenWords.has(candidate.word)) continue
					seenWords.add(candidate.word)
					params.lang.slotWords.set(cacheKey, candidate)
					return candidate
				}
				if (fallbackCandidate) {
					params.lang.slotWords.set(cacheKey, fallbackCandidate)
					return fallbackCandidate
				}
			}

			const seenWords = getNamespaceSeenWords(params.lang, namespace)
			const { morphemes, word } = LANGUAGE.word.simple(params)
			if (seenWords.has(word)) {
				return LANGUAGE.word.unique({ ...params, repeat: true, namespace })
			}
			seenWords.add(word)
			return { morphemes, word }
		},
	},
	spawn: (seed: string) => {
		const lang = spawn(seed, createLanguageRng(seed))
		const dice = lang.dice
		const phonemeClasses = [
			"nasal",
			"liquid",
			"sibilant",
			"guttural",
			"plosive",
			"airy",
		] as const
		// sonic character — rolled first so builders can use them
		lang.phonemeClass = dice.choice(phonemeClasses)
		lang.secondaryPhonemeClass = dice.weightedChoice([
			{ v: null, w: 0.6 },
			...phonemeClasses
				.filter((value) => value !== lang.phonemeClass)
				.map((value) => ({ v: value, w: 0.08 })),
		])
		lang.phonotacticStyle = dice.weightedChoice([
			{ v: "open" as const, w: 0.28 },
			{ v: "balanced" as const, w: 0.47 },
			{ v: "closed" as const, w: 0.25 },
		])
		lang.ending = dice.weightedChoice(
			lang.phonotacticStyle === "open"
				? [
						{ v: PhonemeCatalog.MIDDLE_VOWEL, w: 0.7 },
						{ v: PhonemeCatalog.MIDDLE_CONSONANT, w: 0.3 },
					]
				: lang.phonotacticStyle === "closed"
					? [
							{ v: PhonemeCatalog.MIDDLE_CONSONANT, w: 0.82 },
							{ v: PhonemeCatalog.MIDDLE_VOWEL, w: 0.18 },
						]
					: [
							{ v: PhonemeCatalog.MIDDLE_CONSONANT, w: 0.65 },
							{ v: PhonemeCatalog.MIDDLE_VOWEL, w: 0.35 },
						],
		)
		lang.syllableWeight = dice.weightedChoice(
			lang.phonotacticStyle === "open"
				? [
						{ v: "light" as const, w: 0.45 },
						{ v: "medium" as const, w: 0.45 },
						{ v: "heavy" as const, w: 0.1 },
					]
				: lang.phonotacticStyle === "closed"
					? [
							{ v: "light" as const, w: 0.1 },
							{ v: "medium" as const, w: 0.5 },
							{ v: "heavy" as const, w: 0.4 },
						]
					: [
							{ v: "light" as const, w: 0.22 },
							{ v: "medium" as const, w: 0.56 },
							{ v: "heavy" as const, w: 0.22 },
						],
		)
		// stop chance
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
		// phonemes
		const vowels = buildBasicVowels({
			ending: lang.ending,
			phonotacticStyle: lang.phonotacticStyle,
			dice,
		})
		const { consonantPhonemes, diacriticConsonants, orthoStyle } =
			buildConsonants({
				ending: lang.ending,
				vowels,
				phonemeClass: lang.phonemeClass,
				secondaryPhonemeClass: lang.secondaryPhonemeClass,
				phonotacticStyle: lang.phonotacticStyle,
				dice,
			})
		lang.orthoStyle = orthoStyle
		const { uniqueVowels, vowelPhonemes } = buildComplexVowels({
			vowels,
			consonants: consonantPhonemes[PhonemeCatalog.END_CONSONANT],
			stops: stopChance,
			ending: lang.ending,
			phonotacticStyle: lang.phonotacticStyle,
			diacriticConsonants,
			dice,
		})
		lang.vowels = uniqueVowels
		lang.diphthongs = lang.vowels.filter((v) => !baseVowels.includes(v))
		lang.digraphs = collectDigraphs(consonantPhonemes)
		lang.basePhonemes = { ...consonantPhonemes, ...vowelPhonemes }
		randomizePhonemes(lang)
		// word clusters: each cluster has similar words
		const shortSurnames = dice.random > 0.9
		initClusters({
			shortSurnames,
			shortFirst:
				lang.ending === PhonemeCatalog.MIDDLE_VOWEL && dice.random > 0.9,
			src: lang,
		})
		lang.clusterTemplates = Object.fromEntries(
			Object.entries(lang.clusters).map(([key, cluster]) => [
				key,
				cloneCluster(cluster),
			]),
		)
		const cluster = CLUSTER.spawn({ src: lang, key: "generic", len: 1 })
		// patronymic surnames
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
		// create title & article words
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
		lang.phonemeClass = base.phonemeClass
		lang.secondaryPhonemeClass = base.secondaryPhonemeClass
		lang.syllableWeight = base.syllableWeight
		lang.phonotacticStyle = base.phonotacticStyle
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
		lang.clusterTemplates = Object.fromEntries(
			Object.entries(base.clusterTemplates).map(([key, cluster]) => [
				key,
				cloneCluster(cluster),
			]),
		)
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
		orthoStyle: OrthoStyle | null
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
			orthoStyle: lang.orthoStyle !== "standard" ? lang.orthoStyle : null,
			hasGemination,
		}
	},
	vowel: (vowel: string) => {
		return vowel.includes(PhonemeCatalog.FRONT_VOWEL)
	},
}

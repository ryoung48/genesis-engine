import { CLUSTER } from "@/model/society/language/languages/clusters"
import type {
	BuildSlotSeedParams,
	SpawnClusterParams,
	SpawnParams,
} from "@/model/society/language/languages/internal/types"
import { RNG } from "@/model/society/language/languages/rng"
import {
	type Cluster,
	type Language,
	PhonemeCatalog,
	type WordParams,
} from "@/model/society/language/languages/types"

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

function buildSlotSeed({
	lang,
	key,
	namespace,
	slot,
}: BuildSlotSeedParams): string {
	return `${lang.seed}:word:${normalizeWordKey(key)}:${namespace}:${slot}`
}

function spawnCluster({
	lang,
	params,
	longNames,
}: SpawnClusterParams): Cluster {
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

const spawn = ({ seed, dice }: SpawnParams) => {
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
		dice: RNG.createLanguageRng(
			buildSlotSeed({ lang, key: normalizedKey, namespace, slot }),
		),
		clusters: {},
		clusterTemplates: {},
		seenWords: {},
		slotWords: new Map(),
	}
	const cluster = spawnCluster({
		lang: slotLang,
		params: {
			key: normalizedKey,
			len: resolvedLen,
			ending: resolvedEnding,
			stopChance: resolvedStopChance,
			variation: resolvedVariation,
		},
		longNames: resolvedLongNames,
	})
	const morphemes = CLUSTER.morphemes(cluster, slotLang, repeat)
	return { morphemes, word: morphemes.join("") }
}

export const INTERNAL = {
	spawn,
	buildSlotWord,
	normalizeWordKey,
	baseVowels,
	collectDigraphs,
}

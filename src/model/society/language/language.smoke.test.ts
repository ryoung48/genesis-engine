import { describe, expect, it } from "vitest"
import { LANGUAGE } from "./languages"
import type { Language } from "./languages/types"
import { createNames, type LanguageNameContext } from "./names"

const BATCH_SIZE = 1000
const UNIQUE_BATCH_SIZE = 500
const CULTURE_COUNT = 100
const START_YEAR = 800
const DIVERSE_LANGUAGE_COUNT = 8
const DIVERSE_LANGUAGE_POOL_SIZE = 200
const CLUSTER_SAMPLE_SIZE = 5
const DETERMINISM_SAMPLE_SIZE = 24

const CLUSTER_KEYS = [
	"settlement",
	"wilderness",
	"region",
	"culture",
	"male",
	"female",
	"last",
] as const

type ClusterKey = (typeof CLUSTER_KEYS)[number]

type BatchResult = {
	label: string
	isolatedSurface: string
	count: number
	totalMs: number
	avgMsPerName: number
	namesPerSecond: number
	sample: string[]
}

type LanguageProfileRow = {
	languageSeed: string
	fingerprint: string
	stop: string
	ending: string
	extType: string
	hasGemination: boolean
	settlement: string
	region: string
	culture: string
	personMale: string
	personFemale: string
	surname: string
}

type ClusterSampleRow = {
	languageSeed: string
	clusterKey: ClusterKey
	words: string
	pairSharedRate: number
	avgPairJaccard: number
	uniqueWordRate: number
	morphemePoolSize: number
}

type RealismMetricRow = {
	languageSeed: string
	avgPairSharedRate: number
	avgWithinClusterJaccard: number
	avgCrossClusterPoolJaccard: number
	clusterSeparation: number
}

type UniquenessMetricRow = {
	clusterKey: ClusterKey
	distinctWords: number
	totalWords: number
	exactWordUniquenessRate: number
	avgCrossLanguageWordJaccard: number
	avgCrossLanguagePoolJaccard: number
}

type DeterminismRow = {
	scenario: string
	isolatedSurface: string
	stable: boolean
	hashA: string
	hashB: string
	firstMismatch: string | null
}

type LanguageSeedProfile = {
	languageSeed: string
	selectionKey: string
	fingerprint: string
	stop: string
	ending: string
	extType: string
	hasGemination: boolean
}

type ClusterAnalysis = ClusterSampleRow & {
	wordsList: string[]
	wordSets: Array<Set<string>>
	morphemePools: Set<string>
}

function makeSeed(prefix: string, index?: number): string {
	const normalizedPrefix = prefix.replace(/[^a-z0-9]/gi, "").toLowerCase()
	return index === undefined
		? normalizedPrefix
		: `${normalizedPrefix}${(Math.imul(index + 1, 2654435761) >>> 0).toString(36)}`
}

function round(value: number, digits = 4): number {
	return Number(value.toFixed(digits))
}

function average(values: number[]): number {
	if (values.length === 0) return 0
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

function stableHash(values: readonly string[]): string {
	let hash = 2166136261
	for (const value of values) {
		for (let i = 0; i < value.length; i++) {
			hash ^= value.charCodeAt(i)
			hash = Math.imul(hash, 16777619)
		}
		hash ^= 31
		hash = Math.imul(hash, 16777619)
	}
	return (hash >>> 0).toString(16).padStart(8, "0")
}

function jaccardFromSets(
	left: ReadonlySet<string>,
	right: ReadonlySet<string>,
): number {
	const union = new Set<string>(left)
	for (const value of right) union.add(value)
	if (union.size === 0) return 0

	let intersection = 0
	for (const value of left) {
		if (right.has(value)) intersection++
	}
	return intersection / union.size
}

function findFirstMismatch(
	left: readonly string[],
	right: readonly string[],
): string | null {
	const length = Math.max(left.length, right.length)
	for (let i = 0; i < length; i++) {
		if (left[i] !== right[i]) {
			return `${i}: ${left[i] ?? "<missing>"} != ${right[i] ?? "<missing>"}`
		}
	}
	return null
}

function buildBenchmarkContext(
	seedPrefix = "benchlang",
	provinceCount = BATCH_SIZE,
	cultureCount = CULTURE_COUNT,
): LanguageNameContext {
	const cultures = Array.from({ length: cultureCount }, (_, index) => ({
		language: LANGUAGE.spawn(makeSeed(seedPrefix, index)),
		traditions:
			index % 2 === 0 ? ([] as const) : (["matriarchal_society"] as const),
	}))

	return {
		provinces: Array.from({ length: provinceCount }, (_, index) => ({
			culture: index % cultureCount,
			leaders: [{ time: START_YEAR }],
		})),
		cultures,
		dynasties: Array.from({ length: provinceCount }, (_, index) => ({
			name: `Dynasty ${index}`,
		})),
	}
}

function runBatch(
	label: string,
	isolatedSurface: string,
	count: number,
	factory: () => string[],
): BatchResult & { values: string[] } {
	const startedAt = performance.now()
	const values = factory()
	const totalMs = performance.now() - startedAt

	return {
		label,
		isolatedSurface,
		count,
		totalMs: round(totalMs, 2),
		avgMsPerName: round(totalMs / Math.max(1, count), 4),
		namesPerSecond: Math.round((count / Math.max(totalMs, 0.0001)) * 1000),
		sample: values.slice(0, 5),
		values,
	}
}

function buildLanguageSeedProfile(languageSeed: string): LanguageSeedProfile {
	const lang = LANGUAGE.spawn(languageSeed)
	const classification = LANGUAGE.classify(lang)
	const extType = classification.extType ?? "none"
	const ending = lang.ending === "C" ? "consonant" : "vowel"
	const settlement = LANGUAGE.word.simple({ lang, key: "settlement" }).word
	const personMale = LANGUAGE.word.simple({ lang, key: "male" }).word
	const personFemale = LANGUAGE.word.simple({ lang, key: "female" }).word
	const fingerprint = [
		lang.stop,
		ending,
		extType,
		classification.hasGemination ? "geminate" : "plain",
	].join("|")

	return {
		languageSeed,
		selectionKey: [fingerprint, settlement, personMale, personFemale].join("|"),
		fingerprint,
		stop: lang.stop,
		ending,
		extType,
		hasGemination: classification.hasGemination,
	}
}

function selectDiverseLanguages(): LanguageSeedProfile[] {
	const candidates = Array.from(
		{ length: DIVERSE_LANGUAGE_POOL_SIZE },
		(_, index) => buildLanguageSeedProfile(makeSeed("samplelang", index)),
	)
	const selected: LanguageSeedProfile[] = []
	const seenFingerprints = new Set<string>()

	for (const candidate of candidates) {
		if (selected.length >= DIVERSE_LANGUAGE_COUNT) break
		if (seenFingerprints.has(candidate.selectionKey)) continue
		selected.push(candidate)
		seenFingerprints.add(candidate.selectionKey)
	}

	return selected
}

function createClusterEntries(
	lang: Language,
	clusterKey: ClusterKey,
	count: number,
	mode: "simple" | "unique" = "simple",
): Array<{ word: string; morphemes: string[] }> {
	return Array.from({ length: count }, () =>
		mode === "simple"
			? LANGUAGE.word.simple({ lang, key: clusterKey })
			: LANGUAGE.word.unique({ lang, key: clusterKey }),
	)
}

function buildLanguageProfileRows(
	languageSeeds: readonly LanguageSeedProfile[],
): LanguageProfileRow[] {
	return languageSeeds.map((profile) => {
		const lang = LANGUAGE.spawn(profile.languageSeed)
		return {
			languageSeed: profile.languageSeed,
			fingerprint: profile.fingerprint,
			stop: profile.stop,
			ending: profile.ending,
			extType: profile.extType,
			hasGemination: profile.hasGemination,
			settlement: LANGUAGE.word.simple({ lang, key: "settlement" }).word,
			region: LANGUAGE.word.simple({ lang, key: "region" }).word,
			culture: LANGUAGE.word.simple({ lang, key: "culture" }).word,
			personMale: LANGUAGE.word.simple({ lang, key: "male" }).word,
			personFemale: LANGUAGE.word.simple({ lang, key: "female" }).word,
			surname: LANGUAGE.word.simple({ lang, key: "last" }).word,
		}
	})
}

function buildClusterAnalyses(
	languageSeeds: readonly LanguageSeedProfile[],
): ClusterAnalysis[] {
	return languageSeeds.flatMap((profile) => {
		const lang = LANGUAGE.spawn(profile.languageSeed)
		return CLUSTER_KEYS.map((clusterKey) => {
			const entries = createClusterEntries(
				lang,
				clusterKey,
				CLUSTER_SAMPLE_SIZE,
			)
			const wordSets = entries.map((entry) => new Set(entry.morphemes))
			const pairs: number[] = []
			const sharedPairs: number[] = []
			for (let i = 0; i < wordSets.length; i++) {
				for (let j = i + 1; j < wordSets.length; j++) {
					const overlap = jaccardFromSets(wordSets[i], wordSets[j])
					pairs.push(overlap)
					sharedPairs.push(overlap > 0 ? 1 : 0)
				}
			}
			const morphemePool = new Set<string>()
			for (const entry of entries) {
				for (const morpheme of entry.morphemes) morphemePool.add(morpheme)
			}
			const distinctWords = new Set(entries.map((entry) => entry.word))
			return {
				languageSeed: profile.languageSeed,
				clusterKey,
				words: entries.map((entry) => entry.word).join(" | "),
				pairSharedRate: round(average(sharedPairs)),
				avgPairJaccard: round(average(pairs)),
				uniqueWordRate: round(distinctWords.size / entries.length),
				morphemePoolSize: morphemePool.size,
				wordsList: entries.map((entry) => entry.word),
				wordSets,
				morphemePools: morphemePool,
			}
		})
	})
}

function buildRealismMetrics(
	analyses: readonly ClusterAnalysis[],
): RealismMetricRow[] {
	const byLanguage = new Map<string, ClusterAnalysis[]>()
	for (const analysis of analyses) {
		const existing = byLanguage.get(analysis.languageSeed)
		if (existing) existing.push(analysis)
		else byLanguage.set(analysis.languageSeed, [analysis])
	}

	return Array.from(byLanguage.entries()).map(([languageSeed, rows]) => {
		const crossClusterScores: number[] = []
		for (let i = 0; i < rows.length; i++) {
			for (let j = i + 1; j < rows.length; j++) {
				crossClusterScores.push(
					jaccardFromSets(rows[i].morphemePools, rows[j].morphemePools),
				)
			}
		}
		const avgWithinClusterJaccard = average(
			rows.map((row) => row.avgPairJaccard),
		)
		const avgCrossClusterPoolJaccard = average(crossClusterScores)
		return {
			languageSeed,
			avgPairSharedRate: round(average(rows.map((row) => row.pairSharedRate))),
			avgWithinClusterJaccard: round(avgWithinClusterJaccard),
			avgCrossClusterPoolJaccard: round(avgCrossClusterPoolJaccard),
			clusterSeparation: round(
				avgWithinClusterJaccard - avgCrossClusterPoolJaccard,
			),
		}
	})
}

function buildUniquenessMetrics(
	analyses: readonly ClusterAnalysis[],
): UniquenessMetricRow[] {
	return CLUSTER_KEYS.map((clusterKey) => {
		const rows = analyses.filter(
			(analysis) => analysis.clusterKey === clusterKey,
		)
		const allWords = rows.flatMap((row) => row.wordsList)
		const uniqueWords = new Set(allWords)
		const wordJaccards: number[] = []
		const poolJaccards: number[] = []
		for (let i = 0; i < rows.length; i++) {
			for (let j = i + 1; j < rows.length; j++) {
				wordJaccards.push(
					jaccardFromSets(
						new Set(rows[i].wordsList),
						new Set(rows[j].wordsList),
					),
				)
				poolJaccards.push(
					jaccardFromSets(rows[i].morphemePools, rows[j].morphemePools),
				)
			}
		}
		return {
			clusterKey,
			distinctWords: uniqueWords.size,
			totalWords: allWords.length,
			exactWordUniquenessRate: round(
				uniqueWords.size / Math.max(1, allWords.length),
			),
			avgCrossLanguageWordJaccard: round(average(wordJaccards)),
			avgCrossLanguagePoolJaccard: round(average(poolJaccards)),
		}
	})
}

function generateSimpleSignature(
	seed: string,
	clusterKeys: readonly ClusterKey[],
	count = DETERMINISM_SAMPLE_SIZE,
): string[] {
	const lang = LANGUAGE.spawn(seed)
	return Array.from({ length: count }, (_, index) => {
		const clusterKey = clusterKeys[index % clusterKeys.length]
		return LANGUAGE.word.simple({ lang, key: clusterKey }).word
	})
}

function generateNamesSignature(seedPrefix: string): string[] {
	const context = buildBenchmarkContext(seedPrefix, DETERMINISM_SAMPLE_SIZE, 12)
	const names = createNames(context)
	return Array.from({ length: DETERMINISM_SAMPLE_SIZE }, (_, index) => {
		switch (index % 5) {
			case 0:
				return names.province(index)
			case 1:
				return names.nation(index)
			case 2:
				return names.river(index)
			case 3:
				return names.mountain(index)
			default:
				return names.leader(index, START_YEAR)
		}
	})
}

function compareDeterminism(
	scenario: string,
	isolatedSurface: string,
	factory: () => string[],
): DeterminismRow {
	const sampleA = factory()
	const sampleB = factory()
	return {
		scenario,
		isolatedSurface,
		stable: sampleA.join("\u001f") === sampleB.join("\u001f"),
		hashA: stableHash(sampleA),
		hashB: stableHash(sampleB),
		firstMismatch: findFirstMismatch(sampleA, sampleB),
	}
}

function buildPerformanceResults(): Array<BatchResult & { values: string[] }> {
	const singleLanguage = LANGUAGE.spawn(makeSeed("perfsinglelanguage"))
	const multiLanguageSeeds = Array.from({ length: CULTURE_COUNT }, (_, index) =>
		LANGUAGE.spawn(makeSeed("perfmulti", index)),
	)
	const mixedContext = buildBenchmarkContext("perfcontext")
	const mixedNames = createNames(mixedContext)

	return [
		runBatch("spawn-250", "language spawn only", 250, () =>
			Array.from({ length: 250 }, (_, index) => {
				const lang = LANGUAGE.spawn(makeSeed("perfspawn", index))
				return `${lang.stop}|${lang.ending}`
			}),
		),
		runBatch(
			"single-language-settlement-simple-1000",
			"one language, one cluster, generator only",
			BATCH_SIZE,
			() =>
				Array.from(
					{ length: BATCH_SIZE },
					() =>
						LANGUAGE.word.simple({ lang: singleLanguage, key: "settlement" })
							.word,
				),
		),
		runBatch(
			"single-language-mixed-clusters-simple-1000",
			"one language, rotate clusters, generator only",
			BATCH_SIZE,
			() =>
				Array.from(
					{ length: BATCH_SIZE },
					(_, index) =>
						LANGUAGE.word.simple({
							lang: singleLanguage,
							key: CLUSTER_KEYS[index % CLUSTER_KEYS.length],
						}).word,
				),
		),
		runBatch(
			"multi-language-settlement-simple-1000",
			"rotate languages, one cluster, generator only",
			BATCH_SIZE,
			() =>
				Array.from(
					{ length: BATCH_SIZE },
					(_, index) =>
						LANGUAGE.word.simple({
							lang: multiLanguageSeeds[index % multiLanguageSeeds.length],
							key: "settlement",
						}).word,
				),
		),
		runBatch(
			"single-language-settlement-unique-500",
			"one language, one cluster, uniqueness overhead isolated",
			UNIQUE_BATCH_SIZE,
			() => {
				const lang = LANGUAGE.spawn(makeSeed("perfuniquelanguage"))
				return Array.from(
					{ length: UNIQUE_BATCH_SIZE },
					() => LANGUAGE.word.unique({ lang, key: "settlement" }).word,
				)
			},
		),
		runBatch(
			"names-api-mixed-1000",
			"end-to-end names api surface",
			BATCH_SIZE,
			() =>
				Array.from({ length: BATCH_SIZE }, (_, index) => {
					switch (index % 5) {
						case 0:
							return mixedNames.province(index)
						case 1:
							return mixedNames.nation(index)
						case 2:
							return mixedNames.river(index)
						case 3:
							return mixedNames.mountain(index)
						default:
							return mixedNames.leader(index, START_YEAR)
					}
				}),
		),
	]
}

describe("language name generation benchmark", () => {
	it("reports isolated performance, realism, uniqueness, determinism, and diverse samples", () => {
		const diverseLanguages = selectDiverseLanguages()
		const languageProfiles = buildLanguageProfileRows(diverseLanguages)
		const clusterAnalyses = buildClusterAnalyses(diverseLanguages)
		const clusterSampleRows = clusterAnalyses.map(
			({
				wordsList: _wordsList,
				wordSets: _wordSets,
				morphemePools: _morphemePools,
				...row
			}) => row,
		)
		const realismMetrics = buildRealismMetrics(clusterAnalyses)
		const uniquenessMetrics = buildUniquenessMetrics(clusterAnalyses)
		const determinismRows = [
			compareDeterminism("simple-single-cluster", "base generator only", () =>
				generateSimpleSignature(makeSeed("detsimplesettlement"), [
					"settlement",
				]),
			),
			compareDeterminism(
				"simple-mixed-clusters",
				"base generator with cluster switching",
				() => generateSimpleSignature(makeSeed("detsimplemixed"), CLUSTER_KEYS),
			),
			compareDeterminism(
				"names-api-mixed",
				"end-to-end names api with deterministic slots",
				() => generateNamesSignature("detnames"),
			),
		]
		const performanceResults = buildPerformanceResults()
		const performanceSummary = performanceResults.map(
			({ values: _values, ...row }) => row,
		)

		console.info("Language performance diagnostics")
		console.table(performanceSummary)
		console.info(JSON.stringify(performanceSummary, null, 2))

		console.info("Diverse language profiles")
		console.table(languageProfiles)
		console.info(JSON.stringify(languageProfiles, null, 2))

		console.info("Cluster family samples")
		console.table(clusterSampleRows)
		console.info(JSON.stringify(clusterSampleRows, null, 2))

		console.info("Cluster realism metrics")
		console.table(realismMetrics)
		console.info(JSON.stringify(realismMetrics, null, 2))

		console.info("Cross-language uniqueness metrics")
		console.table(uniquenessMetrics)
		console.info(JSON.stringify(uniquenessMetrics, null, 2))

		console.info("Determinism diagnostics")
		console.table(determinismRows)
		console.info(JSON.stringify(determinismRows, null, 2))

		expect(diverseLanguages.length).toBeGreaterThan(0)
		expect(diverseLanguages.length).toBeLessThanOrEqual(DIVERSE_LANGUAGE_COUNT)
		expect(languageProfiles).toHaveLength(diverseLanguages.length)
		expect(clusterSampleRows).toHaveLength(
			diverseLanguages.length * CLUSTER_KEYS.length,
		)
		expect(realismMetrics).toHaveLength(diverseLanguages.length)
		expect(uniquenessMetrics).toHaveLength(CLUSTER_KEYS.length)
		expect(determinismRows).toHaveLength(3)
		expect(
			determinismRows
				.filter((row) => row.scenario.startsWith("simple-"))
				.every((row) => row.stable),
		).toBe(true)
		expect(performanceSummary).toHaveLength(6)
		for (const batch of performanceResults) {
			expect(batch.values).toHaveLength(batch.count)
			expect(batch.values.every((value) => value.length > 0)).toBe(true)
			expect(Number.isFinite(batch.totalMs)).toBe(true)
			expect(batch.totalMs).toBeGreaterThanOrEqual(0)
		}
		expect(
			clusterSampleRows.every(
				(row) =>
					row.words.length > 0 &&
					row.pairSharedRate >= 0 &&
					row.pairSharedRate <= 1 &&
					row.avgPairJaccard >= 0 &&
					row.avgPairJaccard <= 1 &&
					row.uniqueWordRate >= 0 &&
					row.uniqueWordRate <= 1 &&
					row.morphemePoolSize > 0,
			),
		).toBe(true)
		expect(
			uniquenessMetrics.every(
				(row) =>
					row.distinctWords > 0 &&
					row.totalWords > 0 &&
					row.exactWordUniquenessRate >= 0 &&
					row.exactWordUniquenessRate <= 1 &&
					row.avgCrossLanguageWordJaccard >= 0 &&
					row.avgCrossLanguageWordJaccard <= 1 &&
					row.avgCrossLanguagePoolJaccard >= 0 &&
					row.avgCrossLanguagePoolJaccard <= 1,
			),
		).toBe(true)
	})
})

import {
	existsSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs"
import { join, resolve, sep } from "node:path"
import type { WeatherDescriptionBand } from "@/model/climate/weather/local/description/types"
import type {
	WeatherEnvironmentReport,
	WeatherEnvironmentSummary,
} from "@/test/earth/weather-distributions/environment/types"
// biome-ignore lint/style/noRestrictedImports: Vite loads this digest before application aliases are configured.
import { BENCH_RUN_TIME } from "../run-time/index.ts"
import type {
	WeatherBenchBin,
	WeatherBenchCache,
	WeatherBenchCondition,
	WeatherBenchDetail,
	WeatherBenchGate,
	WeatherBenchParams,
	WeatherBenchRun,
	WeatherReportObject,
} from "./types.ts"

const pattern =
	/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-province-local-weather$/
const cache = new Map<string, WeatherBenchCache>()
function object(value: unknown): WeatherReportObject {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as WeatherReportObject)
		: {}
}
function array(value: unknown): unknown[] {
	return Array.isArray(value) ? value : []
}
function number(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null
}
function count(value: unknown): number {
	return number(value) ?? 0
}
function numbers(value: unknown): Record<string, number> {
	return Object.fromEntries(
		Object.entries(object(value)).filter(
			(entry): entry is [string, number] => number(entry[1]) !== null,
		),
	)
}
function filename({ root, id }: WeatherBenchParams): string {
	if (!pattern.test(id)) throw new Error("Invalid weather report ID")
	const base = realpathSync(resolve(root, "stats/weather"))
	const file = realpathSync(join(base, id, "results.json"))
	if (!file.startsWith(base + sep))
		throw new Error("Invalid weather report path")
	return file
}
function condition(value: unknown): WeatherBenchCondition {
	const c = object(value)
	return {
		kind: String(c.kind),
		samples: count(c.samples),
		fraction: count(c.fraction),
		sites: count(c.sitesWithEvents),
		onsets: count(c.onsets),
		meanRunHours: number(c.meanCompletedRunHours),
		maxRunHours: number(c.maxObservedRunHours),
		daysPerYear: number(c.meanSampledDaysPerSiteYear),
		leftCensored: count(c.leftCensoredRuns),
		rightCensored: count(c.rightCensoredRuns),
		continuation: number(c.continuationProbability),
		activation: number(c.activationProbability),
		persistenceLift: number(c.persistenceLift),
		runHistogram: numbers(c.completedRunHistogramHours),
		gapHistogram: numbers(c.gapHistogramHours),
	}
}
function bin(value: unknown): WeatherBenchBin {
	const b = object(value)
	return {
		dimension: String(b.dimension),
		label: String(b.label),
		sampleHours: count(b.sampleHours),
		sites: array(b.sites).length,
		fractions: Object.fromEntries(
			Object.entries(object(b.conditions)).map(([kind, c]) => [
				kind,
				count(object(c).fraction),
			]),
		),
	}
}
function gate(value: unknown): WeatherBenchGate {
	const g = object(value)
	return {
		name: String(g.name),
		evaluated: count(g.evaluated),
		passed: count(g.passed),
		failed: count(g.failed),
		unknown: count(g.notEvaluated),
		reached: count(g.funnelReached),
		accepted: count(g.funnelPassed),
		rejected: count(g.funnelRejected),
	}
}
function environmentSummary(value: unknown): WeatherEnvironmentSummary | null {
	const s = object(value)
	if (number(s.samples) === null) return null
	return {
		samples: count(s.samples),
		cloudSamples: count(s.cloudSamples),
		cloudCoverSum: count(s.cloudCoverSum),
		cloudCategories: numbers(s.cloudCategories),
		cloudDescriptions: numbers(s.cloudDescriptions),
		genusPresent: numbers(s.genusPresent),
		genusCover: numbers(s.genusCover),
		sky: numbers(s.sky),
		wind: numbers(s.wind),
		temperature: numbers(s.temperature),
		departures: numbers(s.departures),
		windSum: count(s.windSum),
		windMin: number(s.windMin),
		windMax: number(s.windMax),
		temperatureSum: count(s.temperatureSum),
		temperatureMin: number(s.temperatureMin),
		temperatureMax: number(s.temperatureMax),
		departureSum: count(s.departureSum),
		departureMin: number(s.departureMin),
		departureMax: number(s.departureMax),
	}
}
function band(value: unknown): WeatherDescriptionBand {
	const b = object(value)
	return {
		label: String(b.label),
		minimum: number(b.minimum),
		maximum: number(b.maximum),
	}
}
function environment(value: unknown): WeatherEnvironmentReport | null {
	const e = object(value),
		definitions = object(e.definitions),
		overall = environmentSummary(e.overall),
		threshold = number(definitions.departureThresholdC)
	if (
		!overall ||
		!Array.isArray(definitions.wind) ||
		!Array.isArray(definitions.temperature) ||
		threshold === null
	)
		return null
	return {
		overall,
		byCondition: Object.fromEntries(
			Object.entries(object(e.byCondition)).flatMap(([kind, summary]) => {
				const parsed = environmentSummary(summary)
				return parsed ? [[kind, parsed]] : []
			}),
		),
		byPhenomenon: Object.fromEntries(
			Object.entries(object(e.byPhenomenon)).flatMap(([kind, summary]) => {
				const parsed = environmentSummary(summary)
				return parsed ? [[kind, parsed]] : []
			}),
		),
		definitions: {
			wind: array(definitions.wind).map(band),
			temperature: array(definitions.temperature).map(band),
			departureThresholdC: threshold,
		},
	}
}
function detail(params: WeatherBenchParams): WeatherBenchDetail {
	const file = filename(params),
		stat = statSync(file),
		cached = cache.get(file)
	if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size)
		return cached.detail
	const report = object(JSON.parse(readFileSync(file, "utf-8")))
	const configuration = object(report.configuration),
		distribution = object(report.distributions)
	const conditions = array(distribution.conditions)
	const fields = ["seed", "years", "regions", "stepHours", "siteCount"]
	if (
		!fields.every((key) => number(configuration[key]) !== null) ||
		!conditions.length ||
		!Array.isArray(distribution.bins) ||
		!distribution.triggerGates
	)
		throw new Error("No completed weather distributions in this report")
	if (
		!conditions.every((value) => {
			const c = object(value)
			return (
				typeof c.kind === "string" &&
				number(c.samples) !== null &&
				number(c.fraction) !== null
			)
		})
	)
		throw new Error("Malformed weather condition data")
	const run: WeatherBenchRun = {
		model: typeof report.model === "string" ? report.model : null,
		id: params.id,
		startedAt: new Date(
			BENCH_RUN_TIME.parse(pattern.exec(params.id)![1]),
		).toISOString(),
		seed: count(configuration.seed),
		years: count(configuration.years),
		regions: count(configuration.regions),
		stepHours: count(configuration.stepHours),
		siteCount: count(configuration.siteCount),
		comparisonKey: JSON.stringify({
			configuration,
			sites: array(report.sites).map((site) => object(site).region),
		}),
	}
	const invariant = object(report.invariants),
		execution = object(report.execution),
		extremes = object(distribution.weatherExtremes)
	const boolean = (value: unknown) =>
		typeof value === "boolean" ? value : null
	const empty = (value: unknown) =>
		Array.isArray(value) ? value.length === 0 : null
	const consistency = [
		"partitionViolations",
		"stormCloudMismatches",
		"blizzardViolations",
	].map((key) => {
		const values = array(report.sites).map((site) => number(object(site)[key]))
		return {
			label: (
				{
					partitionViolations: "Water partitions",
					stormCloudMismatches: "Storm/cloud agreement",
					blizzardViolations: "Blizzard criteria",
				} as Record<string, string>
			)[key],
			passed:
				values.length && values.every((value) => value !== null)
					? values.every((value) => value === 0)
					: null,
		}
	})
	const distributionSites = array(distribution.sites)
	const pairs = array(distribution.spatial).map((value) => {
		const pair = object(value),
			conditions = Object.entries(object(pair.conditions))
		return {
			firstRegion: number(object(distributionSites[count(pair.first)]).region),
			secondRegion: number(
				object(distributionSites[count(pair.second)]).region,
			),
			distanceKm: count(pair.distanceKm),
			jaccard: Object.fromEntries(
				conditions.map(([kind, c]) => [kind, number(object(c).jaccard)]),
			),
			neighbor: Object.fromEntries(
				conditions.map(([kind, c]) => [
					kind,
					number(object(c).neighborGivenFirst),
				]),
			),
		}
	})
	const result: WeatherBenchDetail = {
		systemPrecipitation: Object.fromEntries(
			Object.entries(object(distribution.systemPrecipitation)).map(
				([kind, value]) => [
					kind,
					{
						drySamples: count(object(value).drySamples),
						wetSamples: count(object(value).wetSamples),
					},
				],
			),
		),
		run,
		pairs,
		conditions: conditions.map(condition),
		environment: environment(distribution.environment),
		bins: array(distribution.bins).map(bin),
		gates: Object.fromEntries(
			Object.entries(object(distribution.triggerGates)).map(
				([scope, values]) => [
					scope,
					Object.fromEntries(
						Object.entries(object(values)).map(([kind, stages]) => [
							kind,
							array(stages).map(gate),
						]),
					),
				],
			),
		),
		checks: [
			{
				label: "Reproducible",
				passed: boolean(invariant.sameTimeReproducible),
			},
			{
				label: "Baseline immutable",
				passed: boolean(invariant.baselineUnchanged),
			},
			{
				label: "Inspection parity",
				passed: boolean(invariant.inspectionMatchesSampling),
			},
			{
				label: "Trigger agreement",
				passed: empty(invariant.gateAgreementViolations),
			},
			{
				label: "Environment accounting",
				passed: boolean(invariant.environmentAccounting),
			},
			{
				label: "Exposure accounting",
				passed: empty(invariant.exposureMismatches),
			},
			...consistency,
		],
		queries: number(execution.queries),
		warmMs: number(execution.warmSnapshotMs),
		batchMs: number(execution.batchMs),
		maxWindMs: number(extremes.maxSustainedWindMs),
		maxGustMs: number(extremes.maxGustMs),
		eligible: [
			["blizzardSnowSeasonSites", "Blizzard · snow-season sites"],
			["sandDustAridBareSites", "Sand/dust · arid bare sites"],
		].map(([key, label]) => {
			const rate = object(object(report.eligibleRates)[key])
			return { label, sites: count(rate.sites), share: number(rate.share) }
		}),
		limitations: array(report.limitations).filter(
			(item): item is string => typeof item === "string",
		),
	}
	cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, detail: result })
	return result
}
function list(root: string): WeatherBenchRun[] {
	const base = join(root, "stats/weather")
	if (!existsSync(base)) return []
	return readdirSync(base, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && pattern.test(entry.name))
		.flatMap((entry) => {
			try {
				return [detail({ root, id: entry.name }).run]
			} catch {
				return []
			}
		})
		.sort((a, b) => b.id.localeCompare(a.id))
}
export const WEATHER_BENCH = { list, detail }

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve, sep } from "node:path"
import type {
	BenchBox,
	BenchDetailParams,
	BenchDistribution,
	BenchEventYear,
	BenchMetric,
	BenchMetricSpec,
	BenchRunDetail,
	BenchRunSummary,
	BenchTick,
	BenchWindow,
} from "@/bench/types"
import type { JsonObject, JsonValue } from "@/test/history-run/comparison/types"

const HISTORY_DIR = "stats/history"
const SKIPPED_DIRS = ["pipeline", "profiled"]
const TICK_BUCKET_YEARS = 10
const MS_PER_SECOND = 1000
const BYTES_PER_MB = 1024 * 1024
const KB_PER_GB = 1024 * 1024
const PERCENT = 100

const METRIC_SPECS: BenchMetricSpec[] = [
	{
		key: "wall",
		label: "Wall time",
		unit: "s",
		lowerIsBetter: true,
		path: ["wallMs"],
		scale: 1 / MS_PER_SECOND,
	},
	{
		key: "peakMemory",
		label: "Peak memory",
		unit: "GB",
		lowerIsBetter: true,
		path: ["peakMemoryKb"],
		scale: 1 / KB_PER_GB,
	},
	{
		key: "generation",
		label: "World generation",
		unit: "s",
		lowerIsBetter: true,
		path: ["generationMs"],
		scale: 1 / MS_PER_SECOND,
	},
	{
		key: "engine",
		label: "Engine init",
		unit: "s",
		lowerIsBetter: true,
		path: ["engineMs"],
		scale: 1 / MS_PER_SECOND,
	},
	{
		key: "people",
		label: "People",
		unit: "s",
		lowerIsBetter: true,
		path: ["peopleMs"],
		scale: 1 / MS_PER_SECOND,
	},
	{
		key: "record",
		label: "Recording",
		unit: "s",
		lowerIsBetter: true,
		path: ["recordMs"],
		scale: 1 / MS_PER_SECOND,
	},
	{
		key: "partitions",
		label: "Partitions",
		unit: "count",
		lowerIsBetter: false,
		path: ["partitionTotal", "partitions"],
		scale: 1,
	},
	{
		key: "siblingWars",
		label: "Sibling wars",
		unit: "count",
		lowerIsBetter: false,
		path: ["partitionTotal", "siblingWars"],
		scale: 1,
	},
	{
		key: "regencies",
		label: "Regencies",
		unit: "count",
		lowerIsBetter: false,
		path: ["partitionTotal", "regencies"],
		scale: 1,
	},
]

const detailCache = new Map<
	string,
	{ mtimeMs: number; detail: BenchRunDetail }
>()

function object(value: JsonValue | undefined): JsonObject {
	return value && typeof value === "object" && !Array.isArray(value)
		? value
		: {}
}

function number(value: JsonValue | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null
}

function mean(values: (number | null)[]): number | null {
	const present = values.filter((value) => value !== null)
	return present.length
		? present.reduce((sum, value) => sum + value, 0) / present.length
		: null
}

function scaled(params: {
	value: number | null
	scale: number
}): number | null {
	return params.value === null ? null : params.value * params.scale
}

function timestampMs(timestamp: string): number {
	return Date.parse(
		timestamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, "T$1:$2:$3.$4Z"),
	)
}

function resolveRun(params: BenchDetailParams): string {
	const base = resolve(params.root, HISTORY_DIR)
	const path = resolve(base, params.id)
	if (
		!path.startsWith(base + sep) ||
		!/^\d+\.json$/.test(params.id.split("/").at(-1) ?? "")
	)
		throw new Error(`Invalid bench run: ${params.id}`)
	if (!existsSync(path)) throw new Error(`Unknown bench run: ${params.id}`)
	return path
}

function list(root: string): BenchRunSummary[] {
	const base = join(root, HISTORY_DIR)
	if (!existsSync(base)) return []
	const runs: BenchRunSummary[] = []
	for (const folder of readdirSync(base, { withFileTypes: true })) {
		if (!folder.isDirectory() || SKIPPED_DIRS.includes(folder.name)) continue
		const match = folder.name.match(
			/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-?(.*)$/,
		)
		if (!match) continue
		for (const file of readdirSync(join(base, folder.name))) {
			if (!/^\d+\.json$/.test(file)) continue
			runs.push({
				id: `${folder.name}/${file}`,
				title: match[2] || folder.name,
				startedAt: new Date(timestampMs(match[1])).toISOString(),
				years: Number.parseInt(file, 10),
				sizeMb: statSync(join(base, folder.name, file)).size / BYTES_PER_MB,
			})
		}
	}
	return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

function seedDiagnostics(params: {
	data: JsonObject
	seed: string
}): JsonObject {
	return object(
		object(params.data.diagnosticsBySeed)[params.seed] ??
			params.data.diagnostics,
	)
}

function metricFor(params: {
	spec: BenchMetricSpec
	seeds: string[]
	diagnostics: Record<string, JsonObject>
}): BenchMetric {
	const { spec } = params
	const perSeed: Record<string, number | null> = {}
	for (const seed of params.seeds) {
		let cursor: JsonValue | undefined = params.diagnostics[seed]
		for (const key of spec.path) cursor = object(cursor)[key]
		perSeed[seed] = scaled({ value: number(cursor), scale: spec.scale })
	}
	return {
		key: spec.key,
		label: spec.label,
		unit: spec.unit,
		lowerIsBetter: spec.lowerIsBetter,
		value: mean(Object.values(perSeed)),
		seeds: perSeed,
	}
}

function governmentTypes(row: JsonObject): JsonObject {
	return object(object(row.government).types)
}

function governmentCounts(row: JsonObject): Record<string, number> {
	const counts: Record<string, number> = {}
	for (const [type, entry] of Object.entries(governmentTypes(row)))
		counts[type] = number(object(entry).realms) ?? 0
	return counts
}

function sizeBucketCounts(row: JsonObject): Record<string, number> {
	const shares = object(row.land).sovereignShares
	const sovereigns = number(row.sovereigns) ?? 0
	const counts: Record<string, number> = {}
	if (Array.isArray(shares))
		shares.forEach((share, bucket) => {
			counts[String(bucket)] = ((number(share) ?? 0) / PERCENT) * sovereigns
		})
	return counts
}

function tieRealmCounts(row: JsonObject): Record<string, number> {
	const counts: Record<string, number> = {}
	const ties = object(object(object(row.diplomaticTies).mean).ties)
	for (const [kind, entry] of Object.entries(ties))
		if (kind !== "any") counts[kind] = number(object(entry).realms) ?? 0
	return counts
}

function distribution(params: {
	rows: JsonObject[]
	counts: (row: JsonObject) => Record<string, number>
}): BenchDistribution {
	const perRow = params.rows.map(params.counts)
	const keys = [...new Set(perRow.flatMap((counts) => Object.keys(counts)))]
	return Object.fromEntries(
		keys.map((key) => [
			key,
			mean(perRow.map((counts) => counts[key] ?? 0)) ?? 0,
		]),
	)
}

function boxFor(params: {
	rows: JsonObject[]
	read: (row: JsonObject) => JsonValue | undefined
	prefix: string
}): BenchBox {
	const at = (quantile: string) =>
		mean(
			params.rows.map((row) => {
				const source = object(params.read(row))
				return number(
					source[params.prefix ? `${params.prefix}.${quantile}` : quantile],
				)
			}),
		)
	return {
		p10: at("p10"),
		p25: at("p25"),
		p50: at("p50"),
		p75: at("p75"),
		p90: at("p90"),
		max: at("max"),
	}
}

function landMean(params: {
	rows: JsonObject[]
	read: (land: JsonObject) => JsonValue | undefined
}): number | null {
	return mean(params.rows.map((row) => number(params.read(object(row.land)))))
}

function sideOutcomes(params: {
	rows: JsonObject[]
	family: string
	side: string
}): BenchDistribution {
	const prefix = `${params.family}.side.${params.side}.`
	const outcomes = new Set<string>()
	for (const row of params.rows)
		for (const key of Object.keys(object(row.military)))
			if (key.startsWith(prefix)) outcomes.add(key.slice(prefix.length))
	return Object.fromEntries(
		[...outcomes].map((outcome) => [
			outcome,
			mean(
				params.rows.map((row) =>
					number(object(row.military)[`${prefix}${outcome}`]),
				),
			) ?? 0,
		]),
	)
}

function levelBuckets(params: {
	rows: JsonObject[]
	key: "development" | "knowledge"
	count: number
}): BenchDistribution {
	return Object.fromEntries(
		Array.from({ length: params.count }, (_, index) => [
			String(index),
			mean(
				params.rows.map((row) => {
					const counts = object(row.land)[params.key]
					return Array.isArray(counts) ? number(counts[index]) : null
				}),
			) ?? 0,
		]),
	)
}

function windowsFor(params: {
	data: JsonObject
	seeds: string[]
}): BenchWindow[] {
	const perSeed = params.seeds.map((seed) => {
		const windows = params.data[seed]
		return Array.isArray(windows) ? windows.map(object) : []
	})
	const count = Math.max(0, ...perSeed.map((windows) => windows.length))
	return Array.from({ length: count }, (_, index) => {
		const rows = perSeed.flatMap((windows) =>
			windows[index] ? [windows[index]] : [],
		)
		const military = (key: string) =>
			mean(rows.map((row) => number(object(row.military)[key])))
		return {
			label: `${rows[0].from}–${rows[0].to}`,
			to: Number(rows[0].to),
			warYearsP50: military("wars.years.p50"),
			warYearsP90: military("wars.years.p90"),
			rebelWarYearsP50: military("rebelWars.years.p50"),
			rebelWarYearsP90: military("rebelWars.years.p90"),
			sovereignSizes: distribution({ rows, counts: sizeBucketCounts }),
			governments: distribution({ rows, counts: governmentCounts }),
			ties: distribution({ rows, counts: tieRealmCounts }),
			development: levelBuckets({ rows, key: "development", count: 5 }),
			knowledge: levelBuckets({ rows, key: "knowledge", count: 7 }),
			peacefulAnnexations: mean(
				rows.map((row) =>
					number(object(row.military)["peacefulAnnexations.n"]),
				),
			),
			rebellionOutcomes: {
				rebels: sideOutcomes({ rows, family: "rebellions", side: "rebels" }),
				loyalists: sideOutcomes({
					rows,
					family: "rebellions",
					side: "loyalists",
				}),
				none: sideOutcomes({ rows, family: "rebellions", side: "none" }),
			},
			warOutcomes: {
				attacker: sideOutcomes({ rows, family: "wars", side: "attacker" }),
				defender: sideOutcomes({ rows, family: "wars", side: "defender" }),
				none: sideOutcomes({ rows, family: "wars", side: "none" }),
			},
			population: {
				stateHeld: landMean({
					rows,
					read: (land) => object(land.population).stateHeld,
				}),
				stateless: landMean({
					rows,
					read: (land) => object(land.population).stateless,
				}),
			},
			largestCity: landMean({
				rows,
				read: (land) => land.largestCity,
			}),
			armySize: boxFor({
				rows,
				read: (row) => object(row.military),
				prefix: "armySize",
			}),
			ships: boxFor({
				rows,
				read: (row) => object(row.navy).ships,
				prefix: "",
			}),
		}
	})
}

const EVENT_BUCKET_YEARS = 100

function eventsFor(params: {
	diagnostics: Record<string, JsonObject>
	seeds: string[]
	startYear: number
}): BenchEventYear[] {
	const perSeed = params.seeds.map((seed) => {
		const years = params.diagnostics[seed].annualEvents
		return Array.isArray(years) ? years.map(object) : []
	})
	const years = Math.max(0, ...perSeed.map((list) => list.length))
	const yearly = Array.from({ length: years }, (_, index) => {
		const rows = perSeed.flatMap((list) => (list[index] ? [list[index]] : []))
		const names = [...new Set(rows.flatMap((row) => Object.keys(row)))]
		const types: BenchDistribution = {}
		for (const name of names)
			types[name] = mean(rows.map((row) => number(object(row[name]).ms))) ?? 0
		return types
	})
	const buckets: BenchEventYear[] = []
	for (let start = 0; start < years; start += EVENT_BUCKET_YEARS) {
		const members = yearly.slice(start, start + EVENT_BUCKET_YEARS)
		const names = [...new Set(members.flatMap((types) => Object.keys(types)))]
		const types: BenchDistribution = {}
		for (const name of names)
			types[name] = mean(members.map((member) => member[name] ?? 0)) ?? 0
		const from = params.startYear + start
		const to = params.startYear + Math.min(start + EVENT_BUCKET_YEARS, years)
		buckets.push({ label: `${from}–${to}`, year: from, types })
	}
	return buckets
}

function ticksFor(params: {
	diagnostics: Record<string, JsonObject>
	seeds: string[]
	startYear: number
}): BenchTick[] {
	const perSeed = params.seeds.map((seed) => {
		const ticks = params.diagnostics[seed].annualTicks
		return Array.isArray(ticks) ? ticks.map(number) : []
	})
	const years = Math.max(0, ...perSeed.map((ticks) => ticks.length))
	const buckets: BenchTick[] = []
	for (let offset = 0; offset < years; offset += TICK_BUCKET_YEARS) {
		const values = perSeed.flatMap((ticks) =>
			ticks.slice(offset, offset + TICK_BUCKET_YEARS),
		)
		buckets.push({ year: params.startYear + offset, ms: mean(values) })
	}
	return buckets
}

function detail(params: BenchDetailParams): BenchRunDetail {
	const path = resolveRun(params)
	const { mtimeMs } = statSync(path)
	const cached = detailCache.get(path)
	if (cached?.mtimeMs === mtimeMs) return cached.detail
	const data: JsonObject = JSON.parse(readFileSync(path, "utf8"))
	const seeds = Object.keys(data)
		.filter((key) => /^\d+$/.test(key))
		.sort()
	const diagnostics: Record<string, JsonObject> = {}
	for (const seed of seeds) diagnostics[seed] = seedDiagnostics({ data, seed })
	const summary = list(params.root).find((run) => run.id === params.id)
	if (!summary) throw new Error(`Unknown bench run: ${params.id}`)
	const first = diagnostics[seeds[0]] ?? {}
	const firstWindows = data[seeds[0]]
	const firstWindow = Array.isArray(firstWindows) ? object(firstWindows[0]) : {}
	const expected = Array.isArray(data.expectedSeeds)
		? data.expectedSeeds.length
		: seeds.length
	const result: BenchRunDetail = {
		run: summary,
		revision:
			typeof first.revision === "string" ? first.revision.slice(0, 8) : "",
		era: typeof first.era === "string" ? first.era : "",
		points: number(first.requestedPoints) ?? 0,
		seeds,
		complete:
			seeds.length === expected &&
			seeds.every((seed) => diagnostics[seed].completed !== false),
		metrics: METRIC_SPECS.map((spec) =>
			metricFor({ spec, seeds, diagnostics }),
		),
		windows: windowsFor({ data, seeds }),
		events: eventsFor({
			diagnostics,
			seeds,
			startYear: number(firstWindow.from) ?? 0,
		}),
		ticks: ticksFor({
			diagnostics,
			seeds,
			startYear: number(firstWindow.from) ?? 0,
		}),
	}
	detailCache.set(path, { mtimeMs, detail: result })
	return result
}

export const BENCH_DIGEST = { list, detail }

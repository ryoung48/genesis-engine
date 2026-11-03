import type { WeatherBenchDetail, WeatherBenchRun } from "@/bench/weather/types"
import { formatBenchValue } from "@/ui/bench/format"
import { WEATHER_BENCH_FORMAT } from "@/ui/bench/weather/format"
import type {
	WeatherBenchBreakdown,
	WeatherBenchCandidatesParams,
	WeatherBenchChart,
	WeatherBenchMetric,
	WeatherBenchPayload,
	WeatherBenchTable,
	WeatherBreakdownParams,
	WeatherConditionParams,
	WeatherGateParams,
	WeatherHistogramParams,
	WeatherMetricParams,
	WeatherSpatialParams,
} from "@/ui/bench/weather/types"
import { uiChartPalette } from "@/ui/components/tokens"
import { formatDistance, formatWindSpeed } from "@/ui/genesis/shared/ui-format"
import { WEATHER_DISPLAY } from "@/ui/genesis/shared/weather-display"

function candidates({
	runs,
	currentId,
}: WeatherBenchCandidatesParams): WeatherBenchRun[] {
	const current = runs.find((run) => run.id === currentId)
	return current
		? runs.filter(
				(run) =>
					run.id !== currentId && run.comparisonKey === current.comparisonKey,
			)
		: []
}
function defaultBaseline(input: WeatherBenchCandidatesParams): string {
	return candidates(input).find((run) => run.id < input.currentId)?.id ?? ""
}
function baseline({
	current,
	baseline,
}: WeatherBenchPayload): WeatherBenchDetail | null {
	return baseline &&
		baseline.run.id !== current.run.id &&
		baseline.run.comparisonKey === current.run.comparisonKey
		? baseline
		: null
}
function runLabel(run: WeatherBenchRun): string {
	return `${new Date(run.startedAt).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · seed ${run.seed} · ${run.years}y`
}
function conditions(input: WeatherBenchPayload): WeatherBenchTable {
	const previous = baseline(input)
	const kinds = [
		...new Set(
			[...input.current.conditions, ...(previous?.conditions ?? [])].map(
				(c) => c.kind,
			),
		),
	]
	return {
		columns: [
			{ id: "condition", label: "Condition" },
			{ id: "current", label: "Current" },
			{ id: "baseline", label: "Baseline" },
			{ id: "delta", label: "Change" },
			{ id: "samples", label: "Snapshots" },
			{ id: "sites", label: "Sites" },
			{ id: "onsets", label: "Run starts" },
			{ id: "days", label: "Days/site/year" },
			{ id: "mean", label: "Mean run" },
			{ id: "max", label: "Max observed" },
		],
		rows: kinds.map((kind) => {
			const c = input.current.conditions.find((c) => c.kind === kind),
				b = previous?.conditions.find((c) => c.kind === kind)
			return {
				id: kind,
				cells: {
					condition: WEATHER_DISPLAY.conditionLabel(kind),
					current: WEATHER_BENCH_FORMAT.percent(c?.fraction ?? null),
					baseline: WEATHER_BENCH_FORMAT.percent(b?.fraction ?? null),
					delta: formatBenchValue({
						value: c && b ? 100 * (c.fraction - b.fraction) : null,
						unit: "pp",
					}),
					samples: WEATHER_BENCH_FORMAT.count(c?.samples ?? null),
					sites: WEATHER_BENCH_FORMAT.count(c?.sites ?? null),
					onsets: WEATHER_BENCH_FORMAT.count(c?.onsets ?? null),
					days: formatBenchValue({
						value: c?.daysPerYear ?? null,
						unit: "ratio",
					}),
					mean: WEATHER_BENCH_FORMAT.hours(c?.meanRunHours ?? null),
					max: WEATHER_BENCH_FORMAT.hours(c?.maxRunHours ?? null),
				},
			}
		}),
	}
}
function systems(input: WeatherBenchPayload): WeatherBenchTable {
	const table = conditions(input)
	return {
		...table,
		columns: [
			...table.columns,
			{ id: "dry", label: "Dry intervals" },
			{ id: "wet", label: "Precipitating intervals" },
		],
		rows: table.rows
			.filter((row) => row.id.startsWith("system:"))
			.map((row) => {
				const value = input.current.systemPrecipitation[row.id.slice(7)]
				return {
					...row,
					cells: {
						...row.cells,
						dry: WEATHER_BENCH_FORMAT.count(value?.drySamples ?? null),
						wet: WEATHER_BENCH_FORMAT.count(value?.wetSamples ?? null),
					},
				}
			}),
	}
}
function metrics({
	current,
	unitSystem,
}: WeatherMetricParams): WeatherBenchMetric[] {
	return [
		{ label: "Snapshots", value: WEATHER_BENCH_FORMAT.count(current.queries) },
		{
			label: "Warm query",
			value: formatBenchValue({ value: current.warmMs, unit: "ms" }),
		},
		{
			label: "64-site batch",
			value: formatBenchValue({ value: current.batchMs, unit: "ms" }),
		},
		{
			label: "Maximum sustained wind",
			value:
				current.maxWindMs === null
					? "—"
					: formatWindSpeed({ value: current.maxWindMs, unitSystem }),
		},
		...current.eligible.map((rate) => ({
			label: rate.label,
			value: rate.sites
				? `${WEATHER_BENCH_FORMAT.percent(rate.share)} · ${rate.sites} sites`
				: "—",
		})),
	]
}
function breakdown(input: WeatherBreakdownParams): WeatherBenchBreakdown {
	const previous = baseline(input)
	const bins = input.current.bins.filter((b) => b.dimension === input.dimension)
	if (input.dimension === "localTime")
		bins.sort((a, b) => a.label.localeCompare(b.label))
	if (input.dimension === "season") {
		const order = ["Spring", "Summer", "Autumn", "Winter"]
		bins.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
	}
	const old = bins.map(
		(bin) =>
			previous?.bins.find(
				(b) => b.dimension === input.dimension && b.label === bin.label,
			)?.fractions[input.kind] ?? null,
	)
	return {
		chart: {
			labels: bins.map((b) => b.label),
			series: [
				{
					label: "Current",
					color: uiChartPalette.bench.current,
					group: "current",
					values: bins.map((b) => (b.fractions[input.kind] ?? 0) * 100),
				},
				...(previous
					? [
							{
								label: "Baseline",
								color: uiChartPalette.bench.baseline,
								group: "baseline",
								values: old.map((v) => (v === null ? null : v * 100)),
							},
						]
					: []),
			],
		},
		table: {
			columns: [
				{ id: "bin", label: "Group" },
				{ id: "exposure", label: "Sample-hours" },
				{ id: "current", label: "Current" },
				{ id: "baseline", label: "Baseline" },
			],
			rows: bins.map((b, i) => ({
				id: b.label,
				cells: {
					bin: b.label,
					exposure: WEATHER_BENCH_FORMAT.count(b.sampleHours),
					current: WEATHER_BENCH_FORMAT.percent(
						b.fractions[input.kind] ?? null,
					),
					baseline: WEATHER_BENCH_FORMAT.percent(old[i]),
				},
			})),
		},
	}
}
function gates({ current, kind, scope }: WeatherGateParams): WeatherBenchTable {
	return {
		columns: [
			{ id: "stage", label: "Gate" },
			{ id: "evaluated", label: "Evaluated" },
			{ id: "passed", label: "Predicate pass" },
			{ id: "unknown", label: "Not evaluated" },
			{ id: "reached", label: "Funnel reached" },
			{ id: "accepted", label: "Funnel passed" },
			{ id: "rejected", label: "First rejection" },
		],
		rows: (current.gates[scope]?.[kind] ?? []).map((g) => ({
			id: g.name,
			cells: {
				stage: g.name
					.replace(/([a-z])([A-Z])/g, "$1 $2")
					.toLowerCase()
					.replace(/^./, (letter) => letter.toUpperCase()),
				evaluated: WEATHER_BENCH_FORMAT.count(g.evaluated),
				passed: WEATHER_BENCH_FORMAT.percent(
					g.evaluated ? g.passed / g.evaluated : null,
				),
				unknown: WEATHER_BENCH_FORMAT.count(g.unknown),
				reached: WEATHER_BENCH_FORMAT.count(g.reached),
				accepted: WEATHER_BENCH_FORMAT.count(g.accepted),
				rejected: WEATHER_BENCH_FORMAT.count(g.rejected),
			},
		})),
	}
}
function temporal(input: WeatherConditionParams): WeatherBenchTable {
	const previous = baseline(input),
		c = input.current.conditions.find((c) => c.kind === input.kind),
		b = previous?.conditions.find((c) => c.kind === input.kind)
	return {
		columns: [
			{ id: "metric", label: "Metric" },
			{ id: "current", label: "Current" },
			{ id: "baseline", label: "Baseline" },
		],
		rows: [
			{
				id: "continuation",
				cells: {
					metric: "Still active at next sample",
					current: WEATHER_BENCH_FORMAT.percent(c?.continuation ?? null),
					baseline: WEATHER_BENCH_FORMAT.percent(b?.continuation ?? null),
				},
			},
			{
				id: "activation",
				cells: {
					metric: "Starts at next inactive sample",
					current: WEATHER_BENCH_FORMAT.percent(c?.activation ?? null),
					baseline: WEATHER_BENCH_FORMAT.percent(b?.activation ?? null),
				},
			},
			{
				id: "lift",
				cells: {
					metric: "Persistence / overall occupancy",
					current: formatBenchValue({
						value: c?.persistenceLift ?? null,
						unit: "ratio",
					}),
					baseline: formatBenchValue({
						value: b?.persistenceLift ?? null,
						unit: "ratio",
					}),
				},
			},
			{
				id: "left",
				cells: {
					metric: "Left-censored runs",
					current: WEATHER_BENCH_FORMAT.count(c?.leftCensored ?? null),
					baseline: WEATHER_BENCH_FORMAT.count(b?.leftCensored ?? null),
				},
			},
			{
				id: "right",
				cells: {
					metric: "Right-censored runs",
					current: WEATHER_BENCH_FORMAT.count(c?.rightCensored ?? null),
					baseline: WEATHER_BENCH_FORMAT.count(b?.rightCensored ?? null),
				},
			},
		],
	}
}
function histogram(input: WeatherHistogramParams): WeatherBenchChart {
	const previous = baseline(input),
		c = input.current.conditions.find((c) => c.kind === input.kind),
		b = previous?.conditions.find((c) => c.kind === input.kind)
	const step = input.current.run.stepHours,
		limits = [step, 2 * step, 4 * step, 8 * step, 16 * step, Infinity]
	const key = input.mode === "runs" ? "runHistogram" : "gapHistogram"
	const summarize = (value: Record<string, number>) =>
		limits.map((limit, index) =>
			Object.entries(value).reduce(
				(sum, [hours, count]) =>
					sum +
					(Number(hours) <= limit &&
					(index === 0 || Number(hours) > limits[index - 1])
						? count
						: 0),
				0,
			),
		)
	return {
		labels: limits.map((limit, i) =>
			i === 0
				? `≤${limit} h`
				: Number.isFinite(limit)
					? `${limits[i - 1]}–${limit} h`
					: `>${limits[i - 1]} h`,
		),
		series: [
			{
				label: "Current",
				color: uiChartPalette.bench.current,
				group: "current",
				values: c ? summarize(c[key]) : limits.map<number | null>(() => null),
			},
			...(previous
				? [
						{
							label: "Baseline",
							color: uiChartPalette.bench.baseline,
							group: "baseline",
							values: b
								? summarize(b[key])
								: limits.map<number | null>(() => null),
						},
					]
				: []),
		],
	}
}
function spatial(input: WeatherSpatialParams): WeatherBenchTable {
	const previous = baseline(input)
	return {
		columns: [
			{ id: "pair", label: "Region pair" },
			{ id: "distance", label: "Distance" },
			{ id: "current", label: "Jaccard" },
			{ id: "baseline", label: "Baseline" },
			{ id: "neighbor", label: "Neighbor active given first" },
		],
		rows: input.current.pairs.map((pair, index) => {
			const old = previous?.pairs.find(
				(p) =>
					p.firstRegion === pair.firstRegion &&
					p.secondRegion === pair.secondRegion,
			)
			return {
				id: String(index),
				cells: {
					pair: `${pair.firstRegion ?? "—"} → ${pair.secondRegion ?? "—"}`,
					distance: formatDistance(pair.distanceKm, input.unitSystem),
					current: WEATHER_BENCH_FORMAT.percent(
						pair.jaccard[input.kind] ?? null,
					),
					baseline: WEATHER_BENCH_FORMAT.percent(
						old?.jaccard[input.kind] ?? null,
					),
					neighbor: WEATHER_BENCH_FORMAT.percent(
						pair.neighbor[input.kind] ?? null,
					),
				},
			}
		}),
	}
}
export const WEATHER_BENCH_VIEW = {
	candidates,
	defaultBaseline,
	runLabel,
	conditions,
	systems,
	metrics,
	breakdown,
	gates,
	temporal,
	histogram,
	spatial,
}

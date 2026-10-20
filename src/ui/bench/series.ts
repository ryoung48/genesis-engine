import { BENCH_TARGETS } from "@/bench/targets"
import type { TargetBand, TargetMetricId } from "@/bench/targets/types"
import type {
	BenchDistribution,
	BenchRunDetail,
	BenchWindow,
} from "@/bench/types"
import type { BoxChartDef, DistributionChartDef } from "@/ui/bench/chartDefs"
import {
	DRILLDOWN_FAMILIES,
	familyColor,
	familyLabel,
	familySum,
} from "@/ui/bench/chartDefs"
import type { ChartSeries, SeriesSpec } from "@/ui/bench/types"
import { uiChartPalette } from "@/ui/components/tokens"

function diffValues(params: {
	current: (number | null)[]
	baseline: (number | null)[]
}): (number | null)[] {
	return params.current.map((value, index) => {
		const base = params.baseline[index] ?? null
		return value === null || base === null ? null : value - base
	})
}

export function resolveSeries(params: {
	specs: SeriesSpec[]
	current: BenchRunDetail
	baseline: BenchRunDetail | null
}): ChartSeries[] {
	const { specs, current, baseline } = params
	return specs.map((spec) => {
		const values = spec.values(current)
		return {
			label: spec.label,
			color: spec.color,
			group: spec.group,
			values: baseline
				? diffValues({ current: values, baseline: spec.values(baseline) })
				: values,
		}
	})
}

function runsOf(params: {
	current: BenchRunDetail
	baseline: BenchRunDetail | null
}): BenchRunDetail[] {
	return params.baseline ? [params.current, params.baseline] : [params.current]
}

const BOX_QUANTILES = ["p10", "p25", "p50", "p75", "p90", "max"] as const

export function boxSpecs(def: BoxChartDef): SeriesSpec[] {
	return BOX_QUANTILES.map((quantile) => ({
		label: quantile,
		color: uiChartPalette.bench.boxStroke,
		values: (run) => run.windows.map((w) => def.box(w)[quantile]),
	}))
}

export function familySpecs(params: {
	current: BenchRunDetail
	baseline: BenchRunDetail | null
}): SeriesSpec[] {
	const runs = runsOf(params)
	return DRILLDOWN_FAMILIES.filter((family) =>
		runs.some((run) =>
			run.windows.some(
				(w) => familySum({ distribution: w.governments, family }) !== 0,
			),
		),
	).map((family) => ({
		label: familyLabel(family),
		color: familyColor(family),
		values: (run) =>
			run.windows.map((w) =>
				familySum({ distribution: w.governments, family }),
			),
	}))
}

export function eventSpecs(params: {
	current: BenchRunDetail
	baseline: BenchRunDetail | null
}): SeriesSpec[] {
	const totals = new Map<string, number>()
	for (const run of runsOf(params))
		for (const year of run.events)
			for (const [name, ms] of Object.entries(year.types))
				totals.set(name, (totals.get(name) ?? 0) + ms)
	const names = [...totals.keys()]
		.filter((name) => (totals.get(name) ?? 0) !== 0)
		.sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
	const colors = uiChartPalette.bench.categories
	return names.map((name, index) => ({
		label: name,
		color: colors[index % colors.length],
		values: (run) => run.events.map((year) => year.types[name] ?? 0),
	}))
}

export function outcomeSpecs(params: {
	current: BenchRunDetail
	baseline: BenchRunDetail | null
	outcomes: (window: BenchWindow) => BenchDistribution
}): SeriesSpec[] {
	const totals = new Map<string, number>()
	for (const run of runsOf(params))
		for (const window of run.windows)
			for (const [name, count] of Object.entries(params.outcomes(window)))
				totals.set(name, (totals.get(name) ?? 0) + count)
	const names = [...totals.keys()]
		.filter((name) => (totals.get(name) ?? 0) !== 0)
		.sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
	const colors = uiChartPalette.bench.categories
	return names.map((name, index) => ({
		label: name,
		color: colors[index % colors.length],
		values: (run) => run.windows.map((w) => params.outcomes(w)[name] ?? 0),
	}))
}

const DEVELOPMENT_LABELS = ["0–0.2", "0.2–0.4", "0.4–0.6", "0.6–0.8", "0.8–1"]
const KNOWLEDGE_LABELS = [
	"−3 to −2",
	"−2 to −1",
	"−1 to 0",
	"0 to 1",
	"1 to 2",
	"2 to 3",
	"3 to 4",
]

export function levelSpecs(params: {
	current: BenchRunDetail
	baseline: BenchRunDetail | null
}): SeriesSpec[] {
	const runs = runsOf(params)
	const series = (
		key: "development" | "knowledge",
		labels: readonly string[],
		colors: readonly string[],
	): SeriesSpec[] =>
		labels
			.map((label, index) => ({ label, index }))
			.filter(({ index }) =>
				runs.some((run) =>
					run.windows.some((w) => (w[key][String(index)] ?? 0) !== 0),
				),
			)
			.map(({ label, index }) => ({
				label: `${key} ${label}`,
				color: colors[index],
				group: key,
				values: (run: BenchRunDetail) =>
					run.windows.map((w) => w[key][String(index)] ?? 0),
			}))
	return [
		...series(
			"development",
			DEVELOPMENT_LABELS,
			uiChartPalette.bench.development,
		),
		...series("knowledge", KNOWLEDGE_LABELS, uiChartPalette.bench.knowledge),
	]
}

export function populationSpecs(): { bars: SeriesSpec[]; lines: SeriesSpec[] } {
	return {
		bars: [
			{
				label: "states",
				color: uiChartPalette.bench.current,
				values: (run) => run.windows.map((w) => w.population.stateHeld),
			},
			{
				label: "stateless",
				color: uiChartPalette.bench.baseline,
				values: (run) => run.windows.map((w) => w.population.stateless),
			},
		],
		lines: [
			{
				label: "largest city",
				color: uiChartPalette.bench.secondary,
				values: (run) => run.windows.map((w) => w.largestCity),
			},
		],
	}
}

export function distributionSpecs(params: {
	def: DistributionChartDef
	current: BenchRunDetail
	baseline: BenchRunDetail | null
}): SeriesSpec[] {
	const { def } = params
	const runs = runsOf(params)
	const keys = [
		...new Set(
			runs.flatMap((run) =>
				run.windows.flatMap((window) => Object.keys(def.pick(window))),
			),
		),
	].filter((key) =>
		runs.some((run) =>
			run.windows.some((window) => (def.pick(window)[key] ?? 0) !== 0),
		),
	)
	const rank = (key: string) => {
		const index = def.order.indexOf(key)
		return index === -1 ? def.order.length : index
	}
	return keys
		.sort((a, b) => rank(a) - rank(b))
		.map((key, index) => ({
			label: def.label({ key }),
			color: def.color({ key, index }),
			values: (run) => run.windows.map((w) => def.pick(w)[key] ?? 0),
		}))
}

export function targetBands(params: {
	target: TargetMetricId | null
	current: BenchRunDetail
	baseline: BenchRunDetail | null
}): (TargetBand | null)[] {
	const { target, current: run, baseline } = params
	if (!target || baseline) return run.windows.map((): TargetBand | null => null)
	return BENCH_TARGETS.bands({
		metric: target,
		years: run.windows.map((window) => window.to),
	})
}

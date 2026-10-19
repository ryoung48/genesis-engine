import type { BenchRunDetail } from "@/bench/types"
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
			values: baseline
				? diffValues({ current: values, baseline: spec.values(baseline) })
				: values,
		}
	})
}

const BOX_QUANTILES = ["p10", "p25", "p50", "p75", "p90", "max"] as const

export function boxSpecs(def: BoxChartDef): SeriesSpec[] {
	return BOX_QUANTILES.map((quantile) => ({
		label: quantile,
		color: uiChartPalette.bench.boxStroke,
		values: (run) => run.windows.map((w) => def.box(w)[quantile]),
	}))
}

export function familySpecs(): SeriesSpec[] {
	return DRILLDOWN_FAMILIES.map((family) => ({
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
	const runs = params.baseline
		? [params.current, params.baseline]
		: [params.current]
	const totals = new Map<string, number>()
	for (const run of runs)
		for (const year of run.events)
			for (const [name, ms] of Object.entries(year.types))
				totals.set(name, (totals.get(name) ?? 0) + ms)
	const names = [...totals.keys()].sort(
		(a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0),
	)
	const colors = uiChartPalette.bench.categories
	return names.map((name, index) => ({
		label: name,
		color: colors[index % colors.length],
		values: (run) => run.events.map((year) => year.types[name] ?? 0),
	}))
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
	const { def, current, baseline } = params
	const runs = baseline ? [current, baseline] : [current]
	const keys = [
		...new Set(
			runs.flatMap((run) =>
				run.windows.flatMap((window) => Object.keys(def.pick(window))),
			),
		),
	]
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

import { TEXT } from "@/model/shared/text"
import type {
	WeatherBandRangeParams,
	WeatherBandTableParams,
	WeatherCloudTableParams,
	WeatherEnvironmentParams,
} from "@/ui/bench/weather/environment/types"
import { WEATHER_BENCH_FORMAT } from "@/ui/bench/weather/format"
import type {
	WeatherBenchPayload,
	WeatherBenchTable,
} from "@/ui/bench/weather/types"
import {
	formatTemperature,
	formatTemperatureDelta,
	formatWindSpeed,
} from "@/ui/genesis/shared/ui-format"

function previous(input: WeatherBenchPayload) {
	return input.baseline?.run.comparisonKey === input.current.run.comparisonKey
		? input.baseline.environment
		: null
}
function clouds(input: WeatherCloudTableParams): WeatherBenchTable {
	const data = input.current.environment,
		old = previous(input)
	const c =
			input.scope === "overall"
				? data?.overall
				: data?.byPhenomenon[input.kind],
		b = input.scope === "overall" ? old?.overall : old?.byPhenomenon[input.kind]
	const kinds = Object.keys(data?.overall.cloudDescriptions ?? {})
	return {
		columns: [
			{ id: "category", label: "Cloud / sky category" },
			{ id: "current", label: "Representative share" },
			{ id: "baseline", label: "Baseline" },
		],
		rows: kinds.map((kind) => ({
			id: kind,
			cells: {
				category: TEXT.capitalize(kind),
				current: WEATHER_BENCH_FORMAT.percent(
					c?.samples && Object.keys(c.cloudDescriptions).length
						? (c.cloudDescriptions[kind] ?? 0) / c.samples
						: null,
				),
				baseline: WEATHER_BENCH_FORMAT.percent(
					b?.samples && Object.keys(b.cloudDescriptions).length
						? (b.cloudDescriptions[kind] ?? 0) / b.samples
						: null,
				),
			},
		})),
	}
}
function phenomena(input: WeatherBenchPayload): WeatherBenchTable {
	const data = input.current.environment,
		old = previous(input)
	return {
		columns: [
			{ id: "category", label: "Phenomenon" },
			{ id: "current", label: "Sampled-time share" },
			{ id: "samples", label: "Samples" },
			{ id: "baseline", label: "Baseline" },
		],
		rows: Object.entries(data?.byPhenomenon ?? {}).map(([kind, group]) => ({
			id: kind,
			cells: {
				category: TEXT.capitalize(kind),
				current: WEATHER_BENCH_FORMAT.percent(
					data?.overall.samples ? group.samples / data.overall.samples : null,
				),
				samples: WEATHER_BENCH_FORMAT.count(group.samples),
				baseline: WEATHER_BENCH_FORMAT.percent(
					old?.overall.samples && old.byPhenomenon[kind]
						? old.byPhenomenon[kind].samples / old.overall.samples
						: null,
				),
			},
		})),
	}
}
function range({
	minimum,
	maximum,
	dimension,
	unitSystem,
}: WeatherBandRangeParams): string {
	const format = (value: number) =>
		dimension === "wind"
			? formatWindSpeed({ value, unitSystem })
			: formatTemperature(value, unitSystem)
	return minimum === null
		? `< ${format(maximum!)}`
		: maximum === null
			? `≥ ${format(minimum)}`
			: `${format(minimum)} – < ${format(maximum)}`
}
function bands(input: WeatherBandTableParams): WeatherBenchTable {
	const data = input.current.environment,
		old = previous(input),
		selected = data?.byPhenomenon[input.kind],
		oldSelected = old?.byPhenomenon[input.kind]
	return {
		columns: [
			{ id: "category", label: "Description" },
			{ id: "range", label: "Range" },
			{ id: "all", label: "All weather" },
			{ id: "condition", label: "Selected condition" },
			{ id: "baseline", label: "Baseline all" },
			{ id: "baselineCondition", label: "Baseline selected" },
		],
		rows: (data?.definitions[input.dimension] ?? []).map((band) => ({
			id: band.label,
			cells: {
				category: band.label,
				range: range({
					...band,
					dimension: input.dimension,
					unitSystem: input.unitSystem,
				}),
				all: WEATHER_BENCH_FORMAT.percent(
					data?.overall.samples
						? (data.overall[input.dimension][band.label] ?? 0) /
								data.overall.samples
						: null,
				),
				condition: WEATHER_BENCH_FORMAT.percent(
					selected?.samples
						? (selected[input.dimension][band.label] ?? 0) / selected.samples
						: null,
				),
				baseline: WEATHER_BENCH_FORMAT.percent(
					old?.overall.samples
						? (old.overall[input.dimension][band.label] ?? 0) /
								old.overall.samples
						: null,
				),
				baselineCondition: WEATHER_BENCH_FORMAT.percent(
					oldSelected?.samples
						? (oldSelected[input.dimension][band.label] ?? 0) /
								oldSelected.samples
						: null,
				),
			},
		})),
	}
}
function global(table: WeatherBenchTable): WeatherBenchTable {
	return {
		...table,
		columns: table.columns.filter(
			(column) =>
				column.id !== "condition" && column.id !== "baselineCondition",
		),
	}
}
function condition(table: WeatherBenchTable): WeatherBenchTable {
	return {
		...table,
		columns: table.columns.filter(
			(column) => column.id !== "all" && column.id !== "baseline",
		),
	}
}
function departures(input: WeatherEnvironmentParams): WeatherBenchTable {
	const data = input.current.environment,
		old = previous(input),
		selected = data?.byPhenomenon[input.kind],
		oldSelected = old?.byPhenomenon[input.kind]
	return {
		columns: [
			{ id: "category", label: "Departure" },
			{ id: "all", label: "All weather" },
			{ id: "condition", label: "Selected condition" },
			{ id: "baseline", label: "Baseline all" },
			{ id: "baselineCondition", label: "Baseline selected" },
		],
		rows: [
			{ key: "colderThanUsual", label: "Colder than usual · cold-snap proxy" },
			{ key: "normal", label: "Within usual range" },
			{ key: "warmerThanUsual", label: "Warmer than usual · warm-spell proxy" },
		].map(({ key, label }) => ({
			id: key,
			cells: {
				category: label,
				all: WEATHER_BENCH_FORMAT.percent(
					data?.overall.samples
						? (data.overall.departures[key] ?? 0) / data.overall.samples
						: null,
				),
				condition: WEATHER_BENCH_FORMAT.percent(
					selected?.samples
						? (selected.departures[key] ?? 0) / selected.samples
						: null,
				),
				baseline: WEATHER_BENCH_FORMAT.percent(
					old?.overall.samples
						? (old.overall.departures[key] ?? 0) / old.overall.samples
						: null,
				),
				baselineCondition: WEATHER_BENCH_FORMAT.percent(
					oldSelected?.samples
						? (oldSelected.departures[key] ?? 0) / oldSelected.samples
						: null,
				),
			},
		})),
	}
}
function moments(input: WeatherBandTableParams): WeatherBenchTable {
	const data = input.current.environment,
		old = previous(input),
		groups = [
			data?.overall,
			data?.byPhenomenon[input.kind],
			old?.overall,
			old?.byPhenomenon[input.kind],
		]
	const sampleValues = groups.map((group) => ({
		samples: group?.samples ?? 0,
		meanWind: group?.samples ? group.windSum / group.samples : null,
		minWind: group?.windMin ?? null,
		maxWind: group?.windMax ?? null,
		meanDeparture: group?.samples ? group.departureSum / group.samples : null,
		minDeparture: group?.departureMin ?? null,
		maxDeparture: group?.departureMax ?? null,
	}))
	const rows = [
		{ key: "meanWind" as const, label: "Mean wind speed", wind: true },
		{ key: "minWind" as const, label: "Minimum wind speed", wind: true },
		{ key: "maxWind" as const, label: "Maximum wind speed", wind: true },
		{
			key: "meanDeparture" as const,
			label: "Mean temperature departure",
			wind: false,
		},
		{
			key: "minDeparture" as const,
			label: "Coldest temperature departure",
			wind: false,
		},
		{
			key: "maxDeparture" as const,
			label: "Warmest temperature departure",
			wind: false,
		},
	]
	return {
		columns: [
			{ id: "metric", label: "Measurement" },
			{ id: "all", label: "All weather" },
			{ id: "condition", label: "Selected condition" },
			{ id: "baseline", label: "Baseline all" },
			{ id: "baselineCondition", label: "Baseline selected" },
		],
		rows: rows
			.filter((row) => row.wind === (input.dimension === "wind"))
			.map((row) => ({
				id: row.key,
				cells: {
					metric: row.label,
					...Object.fromEntries(
						["all", "condition", "baseline", "baselineCondition"].map(
							(key, index) => {
								const value = sampleValues[index][row.key]
								return [
									key,
									value === null
										? "—"
										: row.wind
											? formatWindSpeed({ value, unitSystem: input.unitSystem })
											: formatTemperatureDelta(value, input.unitSystem, 2),
								]
							},
						),
					),
				},
			})),
	}
}
function threshold(input: WeatherEnvironmentParams): string {
	return input.current.environment
		? formatTemperatureDelta(
				input.current.environment.definitions.departureThresholdC,
				input.unitSystem,
				2,
			)
		: "—"
}
export const WEATHER_BENCH_ENVIRONMENT = {
	clouds,
	phenomena,
	bands,
	global,
	condition,
	departures,
	moments,
	threshold,
}

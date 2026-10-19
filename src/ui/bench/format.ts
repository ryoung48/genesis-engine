import type { BenchMetric, BenchUnit } from "@/bench/types"

const UNIT_SUFFIX: Record<BenchUnit, string> = {
	s: " s",
	GB: " GB",
	count: "",
	"%": "%",
	ratio: "",
	people: "",
	ms: " ms",
}

const LARGE_VALUE = 1000
const PEOPLE_THOUSAND = 1000
const PEOPLE_MILLION = 1000000
const PEOPLE_MILLION_WHOLE = 10 * PEOPLE_MILLION

function formatPeople(value: number): string {
	const magnitude = Math.abs(value)
	if (magnitude >= PEOPLE_MILLION)
		return `${(value / PEOPLE_MILLION).toFixed(magnitude >= PEOPLE_MILLION_WHOLE ? 0 : 1)}M`
	if (magnitude >= PEOPLE_THOUSAND)
		return `${(value / PEOPLE_THOUSAND).toFixed(0)}k`
	return value.toFixed(0)
}

export function formatBenchValue(params: {
	value: number | null
	unit: BenchUnit
}): string {
	const { value, unit } = params
	if (value === null) return "—"
	if (unit === "people") return formatPeople(value)
	const digits =
		unit === "count" && Math.abs(value) >= LARGE_VALUE
			? 0
			: Math.abs(value) >= 100
				? 0
				: Math.abs(value) >= 10
					? 1
					: 2
	return `${value.toLocaleString("en-US", { maximumFractionDigits: digits })}${UNIT_SUFFIX[unit]}`
}

export function benchDeltaPercent(params: {
	current: number | null
	baseline: number | null
}): number | null {
	const { current, baseline } = params
	if (current === null || baseline === null || baseline === 0) return null
	return ((current - baseline) / Math.abs(baseline)) * 100
}

export function benchDeltaTone(params: {
	metric: BenchMetric
	deltaPercent: number | null
}): "better" | "worse" | "neutral" {
	const { metric, deltaPercent } = params
	if (deltaPercent === null || !metric.lowerIsBetter) return "neutral"
	if (Math.abs(deltaPercent) < 1) return "neutral"
	return deltaPercent < 0 ? "better" : "worse"
}

export function formatBenchDelta(params: {
	value: number | null
	unit: BenchUnit
}): string {
	const { value, unit } = params
	if (value === null) return "—"
	const sign = value > 0 ? "+" : value < 0 ? "−" : ""
	return `${sign}${formatBenchValue({ value: Math.abs(value), unit })}`
}

export function formatDeltaPercent(deltaPercent: number | null): string {
	if (deltaPercent === null) return "—"
	const sign = deltaPercent > 0 ? "+" : ""
	return `${sign}${deltaPercent.toFixed(1)}%`
}

import type { ReactNode } from "react"
import type { WeatherBenchDetail, WeatherBenchRun } from "@/bench/weather/types"
import type { ChartSeries } from "@/ui/bench/types"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"
export interface WeatherBenchSelection {
	currentId: string
	baselineId: string
}
export interface WeatherBenchLoad<T> {
	value: T | null
	error: string
	loading: boolean
}
export interface WeatherBenchPayload {
	current: WeatherBenchDetail
	baseline: WeatherBenchDetail | null
}
export interface WeatherBenchCandidatesParams {
	runs: WeatherBenchRun[]
	currentId: string
}
export interface WeatherBenchRow {
	id: string
	cells: Record<string, string>
}
export interface WeatherBenchTable {
	columns: { id: string; label: string }[]
	rows: WeatherBenchRow[]
}
export interface WeatherBenchTableProps {
	table: WeatherBenchTable
}
export interface WeatherBenchChart {
	labels: string[]
	series: ChartSeries[]
}
export interface WeatherBreakdownParams extends WeatherBenchPayload {
	kind: string
	dimension: string
}
export interface WeatherConditionParams extends WeatherBenchPayload {
	kind: string
}
export interface WeatherGateParams {
	current: WeatherBenchDetail
	kind: string
	scope: string
}
export interface WeatherMetricParams {
	current: WeatherBenchDetail
	unitSystem: UnitSystem
}
export interface WeatherBenchMetric {
	label: string
	value: string
}

export interface WeatherHistogramParams extends WeatherConditionParams {
	mode: "runs" | "gaps"
}
export interface WeatherSpatialParams extends WeatherConditionParams {
	unitSystem: UnitSystem
}
export type WeatherBenchTab = "overview" | "environment" | "diagnostics"
export interface WeatherBenchPanelProps {
	title: string
	description: string
	children: ReactNode
}

export interface WeatherBenchBreakdown {
	chart: WeatherBenchChart
	table: WeatherBenchTable
}

export interface WeatherBenchCellCompareParams {
	a: string
	b: string
	direction: 1 | -1
}
export interface WeatherBenchSort {
	columnId: string
	direction: "asc" | "desc"
}

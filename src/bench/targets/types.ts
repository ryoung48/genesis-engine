import type { JsonObject } from "@/test/history-run/comparison/types"

export type TargetUnit = "soldiers" | "share" | "ships"

export type TargetBasis = "sourced" | "assumption"

export type TargetStatus = "below" | "within" | "above" | "missing"

export type TargetMetricId =
	| "largestArmy"
	| "monarchyArmyShare"
	| "largestFleet"
	| "fleetSailorShare"

export type TargetValues = Record<TargetMetricId, number | null>

export interface TargetReference {
	title: string
	url: string
}

export interface TargetMetric {
	label: string
	path: string[]
	unit: TargetUnit
}

export interface HistoricalTarget {
	metric: TargetMetricId
	to: number
	min: number
	max: number
	basis: TargetBasis
	note: string
	references: string[]
}

export interface TargetWindow {
	to: number
	values: TargetValues
}

export interface TargetRow {
	target: HistoricalTarget
	current: number | null
	baseline: number | null
	currentStatus: TargetStatus
	baselineStatus: TargetStatus
}

export interface TargetRowsParams {
	current: TargetWindow[]
	baseline: TargetWindow[] | null
}

export interface TargetValuesParams {
	rows: JsonObject[]
}

export interface TargetStatusParams {
	value: number | null
	target: HistoricalTarget
}

export interface TargetFormatParams {
	value: number | null
	unit: TargetUnit
}

export interface TargetBandsParams {
	metric: TargetMetricId
	years: number[]
}

export interface TargetBand {
	min: number
	max: number
}

export interface TargetSourcesParams {
	metric: TargetMetricId
}

export interface TargetSources {
	references: TargetReference[]
	sourced: number[]
	assumed: number[]
}

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| JsonObject
export interface JsonObject {
	[key: string]: JsonValue
}
export interface SavedReport {
	path: string
	data: JsonObject
	seeds: string[]
}
export interface MetricRow {
	section: string
	period: string
	metric: string
	before: JsonValue | undefined
	after: JsonValue | undefined
}
export interface CompareParams {
	current: string
	baseline: string | null
}
export interface ReportPair {
	current: SavedReport
	previous: SavedReport | null
}
export interface FlattenParams {
	value: JsonValue | undefined
	prefix: string
	output: Map<string, JsonValue>
}
export interface RowsParams {
	before: JsonValue | undefined
	after: JsonValue | undefined
	section: string
	period: string
	rows: MetricRow[]
}
export interface DiagnosticsParams {
	report: SavedReport
	seed: string
}
export interface MatchParams {
	current: SavedReport
	previous: SavedReport
}
export interface LogDigest {
	count: number
	sha256: string
}
export interface LogDigester {
	add: (entry: unknown) => void
	value: () => LogDigest
}

export interface CountryCountsParams {
	report: SavedReport
	seed: string
}

import type { WeatherEnvironmentReport } from "@/test/earth/weather-distributions/environment/types"
export type WeatherReportObject = Record<string, unknown>
export interface WeatherBenchParams {
	root: string
	id: string
}
export interface WeatherBenchRun {
	model: string | null
	id: string
	startedAt: string
	seed: number
	years: number
	regions: number
	stepHours: number
	siteCount: number
	comparisonKey: string
}
export interface WeatherBenchCondition {
	kind: string
	samples: number
	fraction: number
	sites: number
	onsets: number
	meanRunHours: number | null
	maxRunHours: number | null
	daysPerYear: number | null
	leftCensored: number
	rightCensored: number
	continuation: number | null
	activation: number | null
	persistenceLift: number | null
	runHistogram: Record<string, number>
	gapHistogram: Record<string, number>
}
export interface WeatherBenchBin {
	dimension: string
	label: string
	sampleHours: number
	sites: number
	fractions: Record<string, number>
}
export interface WeatherBenchGate {
	name: string
	evaluated: number
	passed: number
	failed: number
	unknown: number
	reached: number
	accepted: number
	rejected: number
}
export interface WeatherBenchCheck {
	label: string
	passed: boolean | null
}
export interface WeatherBenchPair {
	firstRegion: number | null
	secondRegion: number | null
	distanceKm: number
	jaccard: Record<string, number | null>
	neighbor: Record<string, number | null>
}
export interface WeatherBenchEligibleRate {
	label: string
	sites: number
	share: number | null
}
export interface WeatherBenchDetail {
	systemPrecipitation: Record<
		string,
		{ drySamples: number; wetSamples: number }
	>
	environment: WeatherEnvironmentReport | null
	pairs: WeatherBenchPair[]
	run: WeatherBenchRun
	conditions: WeatherBenchCondition[]
	bins: WeatherBenchBin[]
	gates: Record<string, Record<string, WeatherBenchGate[]>>
	checks: WeatherBenchCheck[]
	queries: number | null
	warmMs: number | null
	batchMs: number | null
	maxWindMs: number | null
	maxGustMs: number | null
	eligible: WeatherBenchEligibleRate[]
	limitations: string[]
}
export interface WeatherBenchCache {
	mtimeMs: number
	size: number
	detail: WeatherBenchDetail
}

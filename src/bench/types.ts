export type BenchUnit = "s" | "GB" | "count" | "%" | "ratio" | "people" | "ms"

export interface BenchRunSummary {
	id: string
	title: string
	startedAt: string
	years: number
	sizeMb: number
}

export interface BenchMetricSpec {
	key: string
	label: string
	unit: BenchUnit
	lowerIsBetter: boolean
	path: string[]
	scale: number
}

export interface BenchMetric {
	key: string
	label: string
	unit: BenchUnit
	lowerIsBetter: boolean
	value: number | null
	seeds: Record<string, number | null>
}

export type BenchDistribution = Record<string, number>

export interface BenchBox {
	p10: number | null
	p25: number | null
	p50: number | null
	p75: number | null
	p90: number | null
	max: number | null
}

export interface BenchWindow {
	label: string
	warsAttackerWon: number | null
	warsDefenderWon: number | null
	rebelWarsRebelWon: number | null
	rebelWarsLoyalistWon: number | null
	warYearsP50: number | null
	warYearsP90: number | null
	rebelWarYearsP50: number | null
	rebelWarYearsP90: number | null
	sovereignSizes: BenchDistribution
	governments: BenchDistribution
	ties: BenchDistribution
	population: { stateHeld: number | null; stateless: number | null }
	largestCity: number | null
	armySize: BenchBox
	ships: BenchBox
}

export interface BenchTick {
	year: number
	ms: number | null
}

export interface BenchEventYear {
	label: string
	year: number
	types: BenchDistribution
}

export interface BenchRunDetail {
	run: BenchRunSummary
	revision: string
	era: string
	points: number
	seeds: string[]
	complete: boolean
	metrics: BenchMetric[]
	windows: BenchWindow[]
	ticks: BenchTick[]
	events: BenchEventYear[]
}

export interface BenchDetailParams {
	root: string
	id: string
}

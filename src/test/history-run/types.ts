import type { SocietyEra } from "@/model/society/types"

export interface HistoryRunOptions {
	seed: number
	era: SocietyEra
	numPoints: number
	years: number
	summaryPath: string
	log: (line: string) => void
}

export interface EnvParams {
	env: Record<string, string | undefined>
	log: (line: string) => void
}

export interface YearReport {
	year: number
	tickMs: number
	frameMs: number
	nations: number
	activeWars: number
	activeRebelWars: number
	rebelStripedProvinces: number
	occupiedProvinces: number
	recordNations: number
	provinceEvents: number
	titleEvents: number
	wars: number
	diplomacyEvents: number
	population: number
}

export interface HistoryRunSummary {
	seed: number
	era: SocietyEra
	numPoints: number
	provinceCount: number
	generationMs: number
	initMs: number
	reports: YearReport[]
}

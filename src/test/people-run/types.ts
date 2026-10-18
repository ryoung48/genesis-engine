import type { HistoryReportOptions } from "@/test/history-run/report/options/types"
import type { PeopleReport } from "@/test/people-run/report/types"

export interface PeopleRunOptions {
	history: HistoryReportOptions
	sampleSize: number
	outPath: string
}

export interface PeopleRunResult {
	completed: boolean
	sampleSize: number
	seeds: Record<number, PeopleSeedReport>
}

export interface PeopleSeedReport {
	era: HistoryReportOptions["era"]
	numPoints: number
	startYear: number
	years: number
	reachKm: number
	cohesionStep: number
	generationMs: number
	historyMs: number
	peopleMs: number
	peakMemoryKb: number
	people: PeopleReport
}

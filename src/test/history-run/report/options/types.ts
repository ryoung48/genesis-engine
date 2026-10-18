import type { SocietyEra } from "@/model/society/types"

export interface HistoryReportOptions {
	seeds: number[]
	era: SocietyEra
	numPoints: number
	years: number
	lateKnowledgeBand: number
	// [JUSTIFICATION] Omitted, runs start at the engine's default year.
	startYear?: number
	reachKm: number
	cohesionStep: number
	outPath: string
	baselinePath: string | null
	log: (line: string) => void
}

export interface ReportEnvParams {
	env: Record<string, string | undefined>
	log: (line: string) => void
}

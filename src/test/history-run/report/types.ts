import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SocietyEra } from "@/model/society/types"

export interface HistoryReportOptions {
	seeds: number[]
	era: SocietyEra
	numPoints: number
	years: number
	log: (line: string) => void
}

export interface ReportEnvParams {
	env: Record<string, string | undefined>
	log: (line: string) => void
}

export interface EngineParams {
	engine: HistoryState
}

export interface WindowParams {
	engine: HistoryState
	from: number
	to: number
}

export interface CenturyReport {
	from: number
	to: number
	sovereigns: number
	warsPerSovereign: number
	rebellions: number
	largestAtWarShare: number
	rebellionsPerLargest: number
	unionJuniorsPerLargest: number
	raids: number
	raidSuccessShare: number
	revenuePerHead: number
}

export interface UnionJuniorsParams extends EngineParams {
	nation: number
}

export interface RunSeedParams {
	seed: number
	options: HistoryReportOptions
}

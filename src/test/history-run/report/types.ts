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
	regency: RegencyReport
}

export interface RegencyReport {
	regencies: number
	councilShare: number
	usurpationsByUncle: number
	usurpationsByProtector: number
	// Share of rebellions against the largest realms that broke out while
	// the overlord was under a regency.
	largestRebellionRegencyShare: number
	// Share of all rebellions that broke out within two years before the
	// overlord's next succession.
	preSuccessionRebellionShare: number
	restorationAttempts: number
	restorationBacked: number
	restorationRevolts: number
	claimsLapsed: number
}

export interface RegencyReportParams extends WindowParams {
	top: Set<number>
}

export interface UnionJuniorsParams extends EngineParams {
	nation: number
}

export interface RunSeedParams {
	seed: number
	options: HistoryReportOptions
}

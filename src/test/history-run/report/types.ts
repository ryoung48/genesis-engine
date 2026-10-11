import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SocietyEra } from "@/model/society/types"
import type { CoronationReport } from "@/test/history-run/report/coronation/types"
import type { DistrictReport } from "@/test/history-run/report/districts/types"
import type { GovernmentReport } from "@/test/history-run/report/government/types"
import type { InterregnumReport } from "@/test/history-run/report/interregnum/types"
import type { MilitaryReport } from "@/test/history-run/report/military/types"
import type {
	PartitionReport,
	PartitionStateReport,
} from "@/test/history-run/report/partition/types"
import type { RoadsReport } from "@/test/history-run/report/roads/types"
import type {
	DynastyReport,
	MarriageTieReport,
	SuccessionReport,
	UnionReport,
} from "@/test/history-run/report/rulers/types"
import type { SettlementChangeReport } from "@/test/history-run/report/settlement-change/types"

export interface HistoryReportOptions {
	seeds: number[]
	era: SocietyEra
	numPoints: number
	years: number
	lateKnowledgeBand: number
	// [JUSTIFICATION] Omitted, runs start at the engine's default year.
	startYear?: number
	outPath: string
	baselinePath: string | null
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
	roads: RoadsReport
	settlementChange: SettlementChangeReport
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
	succession: SuccessionReport
	marriageTies: MarriageTieReport
	dynasty: DynastyReport
	unions: UnionReport
	coronations: CoronationReport
	elevateMsPerYear: number
	military: MilitaryReport
	districts: DistrictReport
	government: GovernmentReport
	partitionState: PartitionStateReport
	partition: PartitionReport
	interregnum: InterregnumReport
}

export interface RegencyReport {
	regencies: number
	usurpationsByKinsman: number
	usurpationsByProtector: number
	// Share of rebellions against the largest realms that broke out while
	// the overlord was under a regency.
	largestRebellionRegencyShare: number
	// Share of all rebellions that broke out within two years before the
	// overlord's next succession.
	preSuccessionRebellionShare: number
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
	saved: Record<string, unknown>
	seedDiagnostics: Record<string, unknown>
}

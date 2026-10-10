import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SocietyEra } from "@/model/society/types"
import type { DistrictReport } from "@/test/history-run/report/districts/types"
import type {
	HouseholdsReport,
	ResidenceReport,
} from "@/test/history-run/report/households/types"
import type { MilitaryReport } from "@/test/history-run/report/military/types"
import type {
	PartitionReport,
	PartitionStateReport,
} from "@/test/history-run/report/partition/types"
import type { PeopleHealthReport } from "@/test/history-run/report/people-health/types"
import type { MarriageMarketReport } from "@/test/history-run/report/people-marriage/types"
import type {
	OpinionCostReport,
	OpinionReport,
} from "@/test/history-run/report/people-opinion/types"
import type { CharacterStage } from "@/test/history-run/report/people-traits/stages/types"
import type { CharacterReport } from "@/test/history-run/report/people-traits/types"

export interface HistoryReportOptions {
	characterStage: CharacterStage
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

import type { PEOPLE_MARRIAGE_REPORT } from "@/test/history-run/report/people-marriage"
import type { PEOPLE_TRAITS_REPORT } from "@/test/history-run/report/people-traits"

export interface CenturyReport {
	marriageDemography: ReturnType<typeof PEOPLE_MARRIAGE_REPORT.demography>
	inbreeding: ReturnType<typeof PEOPLE_TRAITS_REPORT.inbreeding>
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
	character: CharacterReport
	households: HouseholdsReport & ResidenceReport
	people: PeopleReport
	peopleHealth: PeopleHealthReport
	marriage: MarriageReport
	marriageMarket: MarriageMarketReport
	peopleOpinion: OpinionReport
	peopleOpinionCost: OpinionCostReport
	military: MilitaryReport
	districts: DistrictReport
	partitionState: PartitionStateReport
	partition: PartitionReport
}

export interface MarriageReport {
	alliancesFormed: number
	alliancesStanding: number
	// Mean age at first marriage of sovereign rulers' children, by sex.
	firstMarriageAge: [number, number]
	marriedAbroadShare: number
	heiressUnions: number
	betrothalsMade: number
	betrothalsFulfilled: number
	betrothalsBrokenByDeath: number
	betrothalsBrokenByAlliance: number
}

export type BetrothalOutcome = "made" | "married" | "death" | "alliance"

export interface BetrothalChange {
	time: number
	outcome: BetrothalOutcome
}

export interface FirstMarriage {
	time: number
	sex: number
	age: number
	abroad: boolean
}

export interface MarriageTracker {
	crowned: Set<number>
	seen: Set<number>
	marriages: FirstMarriage[]
	// Standing betrothals by their lower party, as of the last sample.
	betrothed: Map<number, number>
	betrothals: BetrothalChange[]
	// Standing betrothals after init, then at each yearly sample.
	standing: number[]
}

export interface TrackMarriagesParams extends EngineParams {
	tracker: MarriageTracker
}

export interface MarriageReportParams extends WindowParams {
	tracker: MarriageTracker
}

export interface PeopleReport {
	successions: number
	// Children ever born to sovereign rulers who died in the window.
	birthsPerRuler: number
	// Share of those rulers with no child alive at their death.
	childlessShare: number
	newHouseShare: number
	minorShare: number
	childbirthDeaths: number
	twinBirths: number
	alive: number
	msPerYear: number
}

export interface PeopleReportParams extends WindowParams {
	childbirthDeathTimes: number[]
	peopleMs: number
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
	saved: Record<string, unknown>
	seedDiagnostics: Record<string, unknown>
}

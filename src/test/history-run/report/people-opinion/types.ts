import type { PeopleRecord } from "@/model/history/record/people/types"
import type {
	CoronationCounters,
	CoronationKind,
} from "@/model/history/sim/engine/events/succession/coronation/counters/types"
import type { OpinionPoliticsTotals } from "@/model/history/sim/engine/opinion-context/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { MemoryCounts } from "@/model/history/sim/people/opinion/types"

export interface OpinionTracker {
	// Running totals as of the last window's end.
	memory: MemoryCounts
	politics: OpinionPoliticsTotals
	coronations: CoronationCounters
	// Yearly samples of held districts by their holder's religion-excluded
	// opinion band; `unavailable` has no ruler to hold an opinion of.
	districtYears: number[]
	unavailableDistrictYears: number
	sampleMs: number
}

export interface OpinionSampleParams {
	engine: HistoryState
	tracker: OpinionTracker
}

export interface OpinionReportParams extends OpinionSampleParams {
	record: PeopleRecord
	from: number
	to: number
}

export interface HolderOpinions {
	holders: number
	// Holders in [-100,-50), [-50,0), [0,50) and [50,100].
	withReligion: number[]
	withoutReligion: number[]
	mean: number | null
}

export interface PopularitySummary {
	realms: number
	// Sovereign realms with a ruler and no district holder.
	realmsWithoutHolders: number
	meanHolders: number | null
	mean: number | null
	p10: number | null
	p50: number | null
	p90: number | null
}

export interface RebellionBands {
	districtYears: number[]
	unavailableDistrictYears: number
	evaluations: number[]
	rebellions: number[]
	// [JUSTIFICATION] A band no district spent a year in has no rate.
	perDistrictYear: (number | null)[]
}

export interface MemoryReport {
	live: number[]
	refreshes: number[]
	expired: number[]
	died: number[]
}

export interface DriftReport {
	calls: number
	biased: number
	// Bias in [-1,-0.5), [-0.5,0), exactly 0, (0,0.5] and (0.5,1].
	bands: number[]
	meanBias: number | null
	// Expected ladder steps per call on the inputs each call saw.
	meanOriginalStep: number | null
	meanTiltedStep: number | null
	meanStepDelta: number | null
}

export interface DiplomacyOutcomes {
	// Sovereign neighbour pairs by disposition, Rival to Trusted.
	dispositions: number[]
	alliancesFormed: number
	alliancesEnded: number
}

// Each grid is rank (county to hegemony) × quality (uncrowned to magnificent).
// `held`, `ducats` and `memories` use the rank the fee was priced at; `founded`
// and `raised` the tier of the title created.
export interface CoronationGrids {
	held: number[][]
	ducats: number[][]
	memories: number[][]
	founded: number[][]
	raised: number[][]
}

export interface CoronationGridParams extends OpinionSampleParams {
	kind: CoronationKind
}

export interface CoronationReport {
	accession: CoronationGrids
	elevation: CoronationGrids
	deferred: number
	majority: number
	incapable: number
	// Realms flagged composite at the end of each yearly pass, and the
	// rebellion checks made under that flag.
	compositeRealmYears: number
	compositeEvaluations: number
	compositeRebellions: number
}

export interface OpinionReport {
	coronations: CoronationReport
	holderOpinion: HolderOpinions
	popularity: PopularitySummary
	rebellion: RebellionBands
	memory: MemoryReport
	drift: DriftReport
	diplomacy: DiplomacyOutcomes
	loyaltyEvaluations: number
	contextBuilds: number
	marriageCacheMisses: number
	pruneVisited: number
}

// Timing and retained size, kept apart from the simulation statistics.
export interface OpinionCostReport {
	loyaltyMsPerYear: number
	driftMsPerYear: number
	pruneMsPerYear: number
	elevateMsPerYear: number
	reportSampleMsPerYear: number
	// 25 bytes per refresh row sent in the window.
	logPayloadBytes: number
	// Serialized size of the live map and of the record's refresh index.
	liveMemoryBytes: number
	recordMemoryBytes: number
	recordRefreshRows: number
}

export interface OpinionWindowReport {
	statistics: OpinionReport
	cost: OpinionCostReport
}

import type {
	CoronationCounters,
	CoronationKind,
} from "@/model/history/sim/engine/events/succession/coronation/counters/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface CoronationTracker {
	// Running totals as of the last window's end.
	coronations: CoronationCounters
}

export interface CoronationSampleParams {
	engine: HistoryState
	tracker: CoronationTracker
}

export interface CoronationWindowParams extends CoronationSampleParams {
	from: number
	to: number
}

// Each grid is rank (county to hegemony) × quality (uncrowned to magnificent).
// `held` and `ducats` use the rank the fee was priced at; `founded` and
// `raised` the tier of the title created.
export interface CoronationGrids {
	held: number[][]
	ducats: number[][]
	founded: number[][]
	raised: number[][]
}

export interface CoronationGridParams extends CoronationSampleParams {
	kind: CoronationKind
}

export interface CoronationReport {
	accession: CoronationGrids
	elevation: CoronationGrids
	deferred: number
	majority: number
	// Realms flagged composite at the end of each yearly pass, and the
	// rebellion checks made under that flag.
	compositeRealmYears: number
	compositeEvaluations: number
	compositeRebellions: number
}

export interface CoronationWindowReport {
	coronations: CoronationReport
	elevateMsPerYear: number
}

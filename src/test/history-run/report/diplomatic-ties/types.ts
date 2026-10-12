import type { HistoryState } from "@/model/history/sim/engine/state/types"

export type TieKind =
	| "alliance"
	| "vassal"
	| "union"
	| "dependency"
	| "marriage"
	| "war"
	| "any"
export type TieRole = "vassals" | "overlords" | "juniors" | "seniors"

export interface RealmCoverage {
	realms: number
	realmShare: number
}

export interface TieCounts extends RealmCoverage {
	pairs: number
}

export interface DiplomaticTieCounts {
	realms: number
	ties: Record<TieKind, TieCounts>
	roles: Record<TieRole, RealmCoverage>
}

export interface DiplomaticTieSnapshot extends DiplomaticTieCounts {
	year: number
}

export interface DiplomaticTieCapture {
	snapshot: DiplomaticTieSnapshot
	invalidAlliances: number
	mixedGovernmentUnions: number
}

export interface CaptureParams {
	engine: HistoryState
}

export interface CreateTrackerParams {
	initial: DiplomaticTieSnapshot
}

export interface DiplomaticTieTracker {
	initial: DiplomaticTieSnapshot
	samples: number
	totals: DiplomaticTieCounts
}

export interface SampleParams {
	tracker: DiplomaticTieTracker
	snapshot: DiplomaticTieSnapshot
}

export interface WindowParams {
	tracker: DiplomaticTieTracker
	end: DiplomaticTieSnapshot
}

export interface DiplomaticTiesReport {
	initial: DiplomaticTieSnapshot
	end: DiplomaticTieSnapshot
	samples: number
	mean: DiplomaticTieCounts
}

export interface LogParams {
	reports: { from: number; to: number; diplomaticTies: DiplomaticTiesReport }[]
	log: (line: string) => void
}

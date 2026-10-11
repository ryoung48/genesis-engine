import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { Distribution } from "@/test/history-run/report/distribution/types"

export interface DistrictReport {
	realmsByTopTier: Record<string, number>
	seatsByTier: Record<string, number>
	seats: number
	attached: { crown: number; district: number; separated: number }
	crownLandShare: Record<string, Distribution>
	rises: Record<string, number>
	falls: Record<string, number>
	repeatedTierChanges: number
	deriveMs: number
	deriveCalls: number
}

export interface DistrictTracker {
	tiers: Map<number, number>
	changes: { year: number; realm: number; from: number; to: number }[]
	derivations: { year: number; ms: number }[]
}

export interface DistrictCapture {
	tracker: DistrictTracker
	detach: () => void
}

export interface DistrictEngineParams {
	engine: HistoryState
}

export interface DistrictSampleParams extends DistrictEngineParams {
	tracker: DistrictTracker
}

export interface DistrictSummaryParams extends DistrictSampleParams {
	from: number
	to: number
}

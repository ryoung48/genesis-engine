import type {
	AdminMove,
	DisplacedHolder,
} from "@/model/history/sim/engine/events/people/districts/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { Distribution } from "@/test/history-run/report/statistics/types"

export interface DistrictReport {
	realmsByTopTier: Record<string, number>
	seatsByTier: Record<string, number>
	heldByTier: Record<string, number>
	seats: number
	held: number
	attached: { crown: number; district: number; separated: number }
	crownLandShare: Record<string, Distribution>
	displaced: Record<string, number>
	promoted: Record<string, number>
	demoted: Record<string, number>
	landless: Record<string, number>
	rises: Record<string, number>
	falls: Record<string, number>
	repeatedTierChanges: number
	deriveMs: number
	deriveCalls: number
}

export interface DistrictTracker {
	tiers: Map<number, number>
	changes: { year: number; realm: number; from: number; to: number }[]
	reseatings: {
		year: number
		displaced: DisplacedHolder[]
		moves: AdminMove[]
	}[]
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

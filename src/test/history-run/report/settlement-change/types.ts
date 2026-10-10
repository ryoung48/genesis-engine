import type { HistoryState } from "@/model/history/sim/engine/state/types"
export type SettlementBand = "halved" | "shockFall" | "normal" | "surge"
export interface SettlementChange {
	province: number
	year: number
	before: number
	after: number
	ratio: number
	lost: number
	road: boolean
	band: SettlementBand
}
export interface SettlementTracker {
	previous: Float32Array
	steps: SettlementChange[]
}
export interface SettlementSampleParams {
	tracker: SettlementTracker
	engine: HistoryState
	year: number
}
export interface SettlementClassifyParams {
	before: Float32Array
	after: Float32Array
	townMin: number
	year: number
	roadMembers: ReadonlySet<number>
}
export interface SettlementSummaryParams {
	tracker: SettlementTracker
	from: number
	to: number
}
export interface SettlementChangeReport {
	sampled: number
	bands: Record<SettlementBand, { count: number; roadShare: number }>
	largestRatioFalls: SettlementChange[]
	largestPeopleFalls: SettlementChange[]
}

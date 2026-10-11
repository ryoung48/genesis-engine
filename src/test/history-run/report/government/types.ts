import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface GovernmentReportParams {
	engine: HistoryState
	from: number
	to: number
}

export interface GovernmentCounts {
	realms: number
	populationShare: number
	sizeBands: Record<string, number>
}

export interface GovernmentReport {
	types: Record<string, GovernmentCounts>
	changes: Record<string, number>
	inherited: number
	transitions: number
}

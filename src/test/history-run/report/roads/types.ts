import type { HistoryState } from "@/model/history/sim/engine/state/types"
export interface RoadsReportParams {
	engine: HistoryState
	fromBatch: number
}
export interface RoadsReport {
	routes: Record<string, number>
	lengthKm: Record<string, number>
	members: Record<string, number>
	batches: number
	membershipChanges: number
	searched: number
	added: number
	released: number
	rejected: number
	retried: number
	transitions: number[][]
	promoted: number
	demoted: number
	routeLogEntries: number
	pathRegions: number
	timing: {
		initialBuildMs: number
		totalBatchMs: number
		maxBatchMs: number
		seaNeighborMs: number
		landMs: number
		seaMs: number
	}
}

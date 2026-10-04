import type { HistoryState } from "@/model/history/sim/engine/state/types"
export interface StressYearParams {
	state: HistoryState
}
export interface StressFlags {
	war: boolean
	attacking: boolean
	revolt: boolean
	debt: boolean
	paying: boolean
}
export interface WriteStressParams {
	state: HistoryState
	person: number
	value: number
	time: number
}

import type { HistoryState } from "@/model/history/state/types"
import type { Timeline } from "@/model/history/timeline"

export interface DeltaFieldParams {
	timeline: Timeline<number>
	defaultValue: number
	time: number
	delta: number
}

export interface RelationKeyParams {
	state: HistoryState
	a: number
	b: number
}

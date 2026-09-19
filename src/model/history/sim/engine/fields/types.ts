import type { Relation } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface RelationKeyParams {
	state: HistoryState
	a: number
	b: number
}

export interface ProvGetParams {
	state: HistoryState
	p: number
}

export interface ProvSetParams {
	state: HistoryState
	p: number
	value: number
}

export interface ProvDeltaParams {
	state: HistoryState
	p: number
	delta: number
}

export interface RelGetParams {
	state: HistoryState
	a: number
	b: number
}

export interface RelSetParams {
	state: HistoryState
	a: number
	b: number
	rel: Relation
}

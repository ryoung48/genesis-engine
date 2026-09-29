import type {
	Disposition,
	HistoryState,
	Relation,
} from "@/model/history/sim/engine/state/types"

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

export interface DispSetParams {
	state: HistoryState
	a: number
	b: number
	disposition: Disposition
	// [JUSTIFICATION] The state setter can omit the cause for direct fixture writes.
	cause?: string
}

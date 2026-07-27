import type { HistoryState } from "@/model/history/state/types"

export interface DerivedCache {
	children?: Map<string, number[]>
	sovereign?: Map<string, number>
	gravity?: Map<string, number>
	wealthCurrent?: Map<string, number>
	wealthOptimal?: Map<string, number>
	nationAdjacency?: Map<number, { offset: Int32Array; list: Int32Array }>
	provinceWars?: Map<string, number[]>
}

export interface CacheKeyParams {
	p: number
	t: number
}

export interface NationMembersParams {
	state: HistoryState
	root: number
	t: number
	cache?: DerivedCache
}

export interface NationMemberCountParams {
	state: HistoryState
	root: number
	t: number
}

import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { StartingHouse } from "@/model/history/sim/people/family/starting/anchors/types"

export interface BackfillParams {
	state: HistoryState
	seed: number
}

export interface ReconcileParams {
	state: HistoryState
	first: number
}

export interface FreshHouseParams extends BackfillParams {
	kind: 1 | 2
	seat: number
	slot: number
}

export interface CousinPair {
	a: StartingHouse
	b: StartingHouse
	priority: number
}

export interface CousinsParams extends BackfillParams {
	houses: StartingHouse[]
}

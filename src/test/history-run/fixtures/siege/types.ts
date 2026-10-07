import type { HistoryState, War } from "@/model/history/sim/engine/state/types"

export interface SiegeFixture {
	state: HistoryState
	war: War
	caps: number[]
}

export interface SiegeMockParams {
	caps: () => number[]
}

export interface SiegeResultParams {
	state: HistoryState
}

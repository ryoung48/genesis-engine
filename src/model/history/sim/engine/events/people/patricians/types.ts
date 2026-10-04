import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { PeopleRandomSource } from "@/model/history/sim/people/types"

export interface PatricianSlot {
	realm: number
	slot: number
}

export interface PatricianParams {
	found: ((slot: PatricianSlot) => number) | null
	state: HistoryState
	rng: PeopleRandomSource
}

export interface RepublicParams {
	state: HistoryState
	realm: number
}

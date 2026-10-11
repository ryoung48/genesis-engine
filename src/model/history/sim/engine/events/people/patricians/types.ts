import type { PatricianSlot } from "@/model/history/sim/engine/state/patricians/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { PeopleRandomSource } from "@/model/history/sim/people/types"

export interface PatricianParams {
	found: ((slot: PatricianSlot) => number) | null
	state: HistoryState
	rng: PeopleRandomSource
}

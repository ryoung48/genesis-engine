import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type {
	PeopleRandomSource,
	RealmOrigin,
} from "@/model/history/sim/people/types"

export interface SettleRealmParams {
	state: HistoryState
	realm: number
	sovereign: boolean
	origin: RealmOrigin
	time: number
	rng: PeopleRandomSource
	found: ((slot: PatricianSlot) => number) | null
}

export interface PatricianSlot {
	realm: number
	slot: number
}

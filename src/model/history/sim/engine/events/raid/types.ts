import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface InitRaidParams {
	state: HistoryState
	rng: SharedRng
}

export interface RunRaidParams {
	state: HistoryState
	nation: number
	rng: SharedRng
}

export interface ScheduleRaidParams {
	state: HistoryState
	nation: number
	years: number
}

export interface RaidTarget {
	victim: number
	province: number
	output: number
}

export interface RaidNationParams {
	state: HistoryState
	nation: number
}

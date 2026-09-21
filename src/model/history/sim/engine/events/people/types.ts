import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface InitPeopleParams {
	state: HistoryState
	seed: number
	years: number
}

export interface PeopleEventParams {
	state: HistoryState
	id: number
}

export interface DeathEventParams extends PeopleEventParams {
	serial: number
}

export interface WeddingEventParams extends PeopleEventParams {
	wife: number
}

import type { HistoryRng } from "@/model/history/generated/history-rng/types"
import type { HistoryState } from "@/model/history/generated/state/types"

export interface NextEventParams {
	state: HistoryState
	province: number
	rng: HistoryRng
	years?: number
}

export interface ListWarTargetsParams {
	state: HistoryState
	nation: number
}

export interface GetDefenderOccupationCandidatesParams {
	state: HistoryState
	attacker: number
	defender: number
}

export interface SeedInterstateWarsParams {
	state: HistoryState
	rng: HistoryRng
}

export interface SeedRebellionsParams {
	state: HistoryState
	rng: HistoryRng
}

export interface InitWarParams {
	state: HistoryState
	rng: HistoryRng
}

export interface RunWarParams {
	state: HistoryState
	nation: number
	rng: HistoryRng
}

export interface SeedWarStageParams {
	state: HistoryState
	attacker: number
	defender: number
	rng: HistoryRng
	rebel: boolean
	forceOccupied: boolean
}

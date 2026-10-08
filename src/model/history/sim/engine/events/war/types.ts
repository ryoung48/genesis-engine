import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface NextEventParams {
	state: HistoryState
	province: number
	rng: SharedRng
	years?: number
}

export interface ListWarTargetsParams {
	state: HistoryState
	nation: number
}

export interface WarCandidate {
	n: number
	threshold: number
	hasWar: boolean
}

export interface WarTarget extends WarCandidate {
	w: number
	d: number
}

export interface MeasureWarTargetParams extends ListWarTargetsParams {
	candidate: WarCandidate
}

export interface GetDefenderOccupationCandidatesParams {
	state: HistoryState
	attacker: number
	defender: number
}

export interface SeedInterstateWarsParams {
	state: HistoryState
	rng: SharedRng
}

export interface SeedRebellionsParams {
	state: HistoryState
	rng: SharedRng
}

export interface InitWarParams {
	state: HistoryState
	rng: SharedRng
}

export interface RebelParams {
	state: HistoryState
	overlord: number
	subject: number
	laxity: number
	succession: boolean
	rng: SharedRng
}

export interface RunWarParams {
	state: HistoryState
	nation: number
	rng: SharedRng
}

export interface SeedWarStageParams {
	state: HistoryState
	attacker: number
	defender: number
	rng: SharedRng
	goal: "conquest" | "independence"
	forceOccupied: boolean
}

export interface ViableTargetsParams {
	state: HistoryState
	nation: number
}

export interface PressClaimParams {
	state: HistoryState
	attacker: number
	defender: number
	claimant: number
	rng: SharedRng
}

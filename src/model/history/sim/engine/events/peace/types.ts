import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type PeaceReason =
	| "capital taken"
	| "occupation restored"
	| "offensive spent"
	| "offensive repelled"
	| "both exhausted"
	| "no target"
	| "no troops"
	| "not sovereign"
	| "peace bought"

export type PeaceOutcome =
	| "annexation"
	| "restoration"
	| "cession"
	| "indemnity"
	| "bought peace"
	| "white peace"
	| "independence"
	| "lapsed"

export interface PeaceTerms {
	outcome: PeaceOutcome
	winner: number
	transferred: number[]
	payment: number
	payer: number
}

export interface PeaceParams {
	state: HistoryState
	war: War
	reason: PeaceReason
}

export interface ConcludeParams extends PeaceParams {
	rng: SharedRng
}

export interface TruceParams {
	state: HistoryState
	a: number
	b: number
}

export interface BuyoffParams {
	state: HistoryState
	war: War
}

export interface AcceptBuyoffParams extends BuyoffParams {
	rng: SharedRng
}

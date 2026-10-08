import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type PeaceReason =
	| "enforced"
	| "defended"
	| "offensive spent"
	| "offensive repelled"
	| "both exhausted"
	| "no target"
	| "no troops"
	| "not sovereign"
	| "peace bought"
	| "negotiated"
	| "claim lapsed"

export type PeaceOutcome =
	| "annexation"
	| "restoration"
	| "cession"
	| "indemnity"
	| "bought peace"
	| "white peace"
	| "independence"
	| "lapsed"
	| "regime change"
	| "submission"
	| "union"

export interface PeaceTerms {
	outcome: PeaceOutcome
	winner: number
	transferred: number[]
	receiver: number
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

export interface BuyoffParams {
	state: HistoryState
	war: War
}

export interface AcceptBuyoffParams extends BuyoffParams {
	rng: SharedRng
}

export interface NegotiateParams extends AcceptBuyoffParams {
	stalled: boolean
}

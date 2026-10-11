import type { MarriagePartner } from "@/model/history/sim/engine/events/diplomacy/marriage/types"
import type { SuccessionChoice } from "@/model/history/sim/engine/events/succession/systems/types"
import type { Ruler } from "@/model/history/sim/engine/state/rulers/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface RunSuccessionParams {
	state: HistoryState
	realm: number
	leaderIdx: number
	rng: SharedRng
}

export interface RunYearParams {
	state: HistoryState
	rng: SharedRng
}

export interface RealmRngParams {
	state: HistoryState
	realm: number
	rng: SharedRng
}

export interface PretenderRevoltParams {
	state: HistoryState
	realm: number
	// Dynasty the rebel ruler is founded under; -1 for a new one.
	dynasty: number
	// Chance that each other district joins the revolt.
	supporters: number
	rng: SharedRng
}

export interface WeakCrownParams {
	state: HistoryState
	realm: number
	claim: number
	rng: SharedRng
}

export interface ForeignClaimParams {
	state: HistoryState
	realm: number
	claimant: MarriagePartner
	rng: SharedRng
}

export interface SuccessorParams {
	state: HistoryState
	realm: number
	late: Ruler
	partners: MarriagePartner[]
	choice: SuccessionChoice
	rng: SharedRng
}

export interface Successor {
	ruler: Ruler
	// The marriage partner whose living ruler takes the throne, forming a union.
	union: MarriagePartner | null
}

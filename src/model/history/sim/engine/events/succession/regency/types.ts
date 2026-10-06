import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { RegencyCause, RegentKind } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type RegencyEndCause =
	| "age"
	| "death"
	| "usurpation"
	| "lost"
	| "overthrown"

export interface RegentChoice {
	// -1 for a regency council.
	regent: number
	kind: RegentKind
}

export interface RealmRegencyParams {
	state: HistoryState
	realm: number
}

export interface WardParams {
	state: HistoryState
	realm: number
	ward: number
}

export interface ChooseParams extends WardParams {
	cause: RegencyCause
}

export interface AppointParams {
	state: HistoryState
	realm: number
	ward: number
	cause: RegencyCause
	choice: RegentChoice
}

export interface RegentDiedParams {
	state: HistoryState
	regent: number
}

export interface BeginParams {
	state: HistoryState
	realm: number
	cause: RegencyCause
}

export interface EndParams {
	state: HistoryState
	realm: number
	cause: RegencyEndCause
}

export interface ComeOfAgeParams {
	state: HistoryState
	realm: number
	leader: number
	rng: SharedRng
}

export interface ReviewParams {
	state: HistoryState
}

export interface BindsToParams {
	state: HistoryState
	realm: number
	other: number
}

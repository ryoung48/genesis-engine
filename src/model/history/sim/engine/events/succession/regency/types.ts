import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { RegentKind } from "@/model/history/sim/people/types"

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

export interface AppointParams {
	state: HistoryState
	realm: number
	ward: number
	choice: RegentChoice
}

export interface RegentDiedParams {
	state: HistoryState
	realm: number
	regent: number
}

export interface BeginParams {
	state: HistoryState
	realm: number
	choice: RegentChoice
}

export interface EndParams {
	state: HistoryState
	realm: number
	cause: RegencyEndCause
}

export interface LeaderParams {
	state: HistoryState
	realm: number
	leader: number
}

export interface ReviewParams {
	state: HistoryState
}

export interface BindsToParams {
	state: HistoryState
	realm: number
	other: number
}

import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { DeathCause } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface RunDeathParams {
	state: HistoryState
	person: number
	revision: number
	rng: SharedRng
}

export interface KillParams {
	state: HistoryState
	person: number
	cause: DeathCause
	rng: SharedRng
}

export interface MarkParams {
	state: HistoryState
	person: number
	cause: DeathCause
}

export interface DeathEffectParams {
	state: HistoryState
	person: number
	cause: DeathCause
}

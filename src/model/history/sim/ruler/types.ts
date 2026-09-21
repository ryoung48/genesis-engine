import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface InstallRulerParams {
	state: HistoryState
	seat: number
	heir: number
	dynasty: number
	rng: SharedRng
	initial: boolean
}

export interface LogSeatParams {
	state: HistoryState
	person: number
	seat: number
	gained: boolean
}

export interface ReleaseModeParams {
	state: HistoryState
	seat: number
}

export interface VacateRulerParams {
	state: HistoryState
	seat: number
}

export interface ReseatRulersParams {
	state: HistoryState
	rulers: Iterable<number>
}

export interface RulerMove {
	from: number
	to: number
	person: number
	birth: number
	end: number
	nameSeed: number
	dynasty: number
	claim: number
	targetUrban: number
}

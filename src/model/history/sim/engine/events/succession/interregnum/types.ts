import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface InterregnumSeat {
	seat: number
	holder: number
}

export interface InterregnumSnapshot {
	seats: InterregnumSeat[]
	titles: number[]
}

export type InterregnumSkipReason = "left the realm" | "holder changed"

export interface InterregnumSkip {
	seat: number
	reason: InterregnumSkipReason
}

export interface InterregnumWar {
	attacker: number
	defender: number
}

export interface InterregnumRun {
	state: HistoryState
	realm: number
	dying: number
	rng: SharedRng
	freed: InterregnumSeat[]
	skipped: InterregnumSkip[]
	cutOff: number[]
	titles: number[]
}

export interface BeginParams {
	state: HistoryState
	realm: number
	dying: number
	rng: SharedRng
}

export interface SnapshotParams {
	state: HistoryState
	realm: number
	dying: number
}

export interface DeclareWarsParams {
	run: InterregnumRun
}

export interface FinishParams {
	run: InterregnumRun
	ruler: number
}

export type InterregnumNoteData = {
	nation: number
	dying: number
	ruler: number
	government: string
	freed: number[]
	holders: number[]
	skipped: number[]
	skippedReasons: InterregnumSkipReason[]
	cutOff: number[]
	warAttackers: number[]
	warDefenders: number[]
	titlesLost: number[]
	titlesLostTier: number[]
}

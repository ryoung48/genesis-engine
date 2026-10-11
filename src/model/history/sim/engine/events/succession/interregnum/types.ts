import type { RulerRef } from "@/model/history/record/rulers/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface InterregnumSnapshot {
	seats: number[]
	titles: number[]
}

export type InterregnumSkipReason = "left the realm"

export interface InterregnumSkip {
	seat: number
	reason: InterregnumSkipReason
}

export interface InterregnumWar {
	attacker: number
	defender: number
}

export interface FreedSeat {
	seat: number
	ruler: RulerRef
}

export interface InterregnumRun {
	state: HistoryState
	realm: number
	late: RulerRef
	rng: SharedRng
	freed: FreedSeat[]
	skipped: InterregnumSkip[]
	cutOff: number[]
	titles: number[]
}

export interface BeginParams {
	state: HistoryState
	realm: number
	late: RulerRef
	rng: SharedRng
}

export interface SnapshotParams {
	state: HistoryState
	realm: number
}

export interface DeclareWarsParams {
	run: InterregnumRun
}

export interface FinishParams {
	run: InterregnumRun
	ruler: RulerRef
}

export type InterregnumNoteData = {
	nation: number
	government: string
	freed: number[]
	skipped: number[]
	skippedReasons: InterregnumSkipReason[]
	cutOff: number[]
	warAttackers: number[]
	warDefenders: number[]
	titlesLost: number[]
	titlesLostTier: number[]
}

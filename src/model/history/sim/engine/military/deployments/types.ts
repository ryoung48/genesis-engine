import type { HistoryState, War } from "@/model/history/sim/engine/state/types"

export interface StateParams {
	state: HistoryState
}

export interface NationParams extends StateParams {
	nation: number
}

export interface NationsParams extends StateParams {
	nations: Set<number>
}

export interface WarsParams extends StateParams {
	wars: Set<number>
}

export interface SameListParams<T> {
	a: T[]
	b: T[]
}

export interface CallParams extends NationParams {
	leader: number
	target: number
	side: WarSide
	war: War | null
}

export interface ReadyParams extends NationParams {
	exhaustion: Map<number, boolean>
	war: War | null
}

export interface EligibleParams extends CallParams {
	exhaustion: Map<number, boolean>
}

export interface CandidateSideParams extends StateParams {
	leader: number
	target: number
	side: WarSide
	war: War | null
}

export interface SideParams extends StateParams {
	war: War
	side: WarSide
}

export interface Assignment {
	war: War
	opponent: number
}

export type WarSide = "attacker" | "defender"

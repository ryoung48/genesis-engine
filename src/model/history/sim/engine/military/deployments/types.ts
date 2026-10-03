import type { HistoryState, War } from "@/model/history/sim/engine/state/types"

export interface StateParams {
	state: HistoryState
}

export interface NationParams extends StateParams {
	nation: number
}

export interface EligibleParams extends NationParams {
	exhaustion: Map<number, boolean>
	leader: number
	target: number
	side: WarSide
	war: War | null
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

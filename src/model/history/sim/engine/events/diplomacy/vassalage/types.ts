import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface VassalPairParams {
	state: HistoryState
	a: number
	b: number
}

export interface VassalPair {
	vassal: number
	overlord: number
}

export interface VassalLinkParams {
	state: HistoryState
	vassal: number
	overlord: number
}

export interface VassalBondParams extends VassalLinkParams {
	cause: "seed" | "diplomacy" | "backing" | "regime change"
}

export interface BreaksParams extends VassalLinkParams {
	threat: number
}

export interface AnswersParams extends VassalLinkParams {
	attacking: boolean
}

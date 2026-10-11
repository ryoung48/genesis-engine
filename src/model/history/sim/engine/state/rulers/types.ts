import type { RulerRef } from "@/model/history/record/rulers/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface Ruler {
	rulerId: number
	nameSeed: number
	nameOrigin: number
	sex: number
	dynasty: number
	birthMs: number
	deathMs: number
}

export interface MarriageTie {
	first: number
	second: number
}

export type AgeTable = "inherited" | "elected" | "fresh"

export interface AgeBins {
	start: number
	weights: readonly number[]
}

export interface DrawBinParams {
	bins: AgeBins
	floor: number
	rng: SharedRng
}

export interface AccessionAgeParams {
	age: AgeTable
	rng: SharedRng
}

export interface DrawRulerParams {
	state: HistoryState
	p: number
	// -1 founds a new dynasty at p.
	dynasty: number
	age: AgeTable
	rng: SharedRng
}

export interface RealmRulerParams {
	state: HistoryState
	p: number
}

export interface EndRegencyParams {
	state: HistoryState
	realm: number
	cause: string
}

export interface WriteRulerParams {
	state: HistoryState
	p: number
	ruler: Ruler
	claim: number
}

export interface RulerRefParams {
	state: HistoryState
	ruler: Ruler
}

export interface NoteFieldsParams {
	prefix: string
	ref: RulerRef
}

export interface NoteColumnsParams {
	prefix: string
	refs: RulerRef[]
}

export interface ReadNoteParams {
	data: Record<string, unknown>
	prefix: string
}

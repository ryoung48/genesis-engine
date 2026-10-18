import type { RulerFact, TieRecord } from "@/model/people/anchors/types"
import type { Cast, Person } from "@/model/people/cast/types"

export type TieClass = "R" | "C" | "S" | "I"

export interface StartParams {
	cast: Cast
	tie: TieRecord
}

export interface SideParams {
	cast: Cast
	fact: RulerFact
	ruler: Person
	timeMs: number
}

export interface Side {
	fact: RulerFact
	ruler: Person
	classes: Record<"R" | "C" | "S", Person[]>
}

export interface EligibleParams {
	cast: Cast
	person: Person
	timeMs: number
}

export interface ProposeParams {
	cast: Cast
	side: Side
	timeMs: number
	sex: number
}

export interface PairParams {
	cast: Cast
	first: Person
	second: Person
}

export interface WedParams {
	cast: Cast
	first: Person
	second: Person
	timeMs: number
}

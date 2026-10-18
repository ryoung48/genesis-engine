import type { Character } from "@/model/people/character/types"

export interface OpinionView {
	character: Character
	age: number
	culture: number
	religion: number
	heritage: number
}

export interface OpinionParams {
	observer: OpinionView
	target: OpinionView
	kin: boolean
	spouse: boolean
}

export interface OpinionBreakdown {
	personality: number
	culture: number
	religion: number
	reputation: number
	kin: number
	spouse: number
	unclamped: number
	total: number
}

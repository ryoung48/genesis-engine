import type { KinshipContext } from "@/model/history/sim/people/kinship/types"
import type { Character } from "@/model/history/sim/people/traits/types"

export interface OpinionPerson {
	id: number
	character: Character
	age: number
	culture: number
	heritage: number
	religion: number
	sovereignSeats: number[]
	districtSovereigns: number[]
}

export interface OpinionContext {
	personOf: (person: number) => OpinionPerson | null
	kinship: KinshipContext
	married: (pair: OpinionPair) => boolean
}

export interface OpinionPair {
	a: number
	b: number
	time: number
}

export interface OpinionParams {
	observer: number
	target: number
	time: number
	context: OpinionContext
}

export interface OpinionBreakdown {
	personality: number
	culture: number
	religion: number
	reputation: number
	kin: number
	spouse: number
	memories: number
	unclamped: number
	total: number
}

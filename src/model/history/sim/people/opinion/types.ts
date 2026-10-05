import type { KinshipContext } from "@/model/history/sim/people/kinship/types"
import type {
	OpinionMemory,
	OpinionMemoryReason,
} from "@/model/history/sim/people/opinion/memory/types"
import type { Character } from "@/model/history/sim/people/traits/types"
import type { PeopleState } from "@/model/history/sim/people/types"

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
	// What the observer remembers of the target as of the time, one per reason.
	memoriesOf: (query: OpinionMemoryQueryParams) => readonly OpinionMemory[]
}

export interface OpinionPair {
	a: number
	b: number
	time: number
}

export interface OpinionMemoryQueryParams {
	observer: number
	target: number
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

// Running totals by reason code, and the cost of the yearly prune.
export interface MemoryCounts {
	refreshes: number[]
	expired: number[]
	died: number[]
	visited: number
	pruneMs: number
}

export interface RememberParams {
	people: PeopleState
	observer: number
	target: number
	reason: OpinionMemoryReason
	time: number
}

export interface PruneParams {
	people: PeopleState
	time: number
}

export interface LoyaltyParams {
	breakdown: OpinionBreakdown | null
}

export interface PopularityParams {
	ruler: number
	holders: readonly number[]
	time: number
	context: OpinionContext
}

export interface Popularity {
	// Mean religion-excluded opinion of the ruler; 0 with no holder.
	value: number
	count: number
	// Holders in [-100,-50), [-50,0), [0,50) and [50,100].
	bands: number[]
}

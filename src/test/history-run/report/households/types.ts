import type { AffiliationRecord } from "@/model/history/record/people/query/affiliation/types"
import type { PeopleRecord } from "@/model/history/record/people/types"
import type { JournalTransaction } from "@/model/history/sim/engine/journal/types"

export interface StructuralSample {
	timeMs: number
	sovereigns: Set<number>
}

export interface HouseholdsReport {
	heldSeatsHistogram: [number, number, number]
	seatsPerHolder: number | null
	unionHolders: number
}

export interface BuildHouseholdsParams {
	people: PeopleRecord
	samples: StructuralSample[]
	fromMs: number
	toMs: number
	final: boolean
}

export interface TerritoryParams {
	parents: ArrayLike<number>
	owners: ArrayLike<number>
	timeMs: number
}

export interface IngestTerritoryParams {
	territory: AffiliationRecord
	transactions: JournalTransaction[]
}

export interface ResidenceReport {
	residenceRows: number
	sameResidenceRealmChanges: number
}

export interface ResidenceWindow {
	fromMs: number
	toMs: number
	final: boolean
}

export interface ResidenceReportParams {
	people: PeopleRecord
	territory: AffiliationRecord
	windows: ResidenceWindow[]
}

export interface OccupancyInterval {
	endIncluded: boolean
	start: number
	end: number
}

export interface BoundParams {
	values: number[]
	time: number
	inclusive: boolean
}

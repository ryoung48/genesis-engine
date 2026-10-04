import type { PeopleRecord } from "@/model/history/record/people/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { Anchor } from "@/model/history/sim/people/family/starting/anchors/types"
import type { StartingFamilies } from "@/model/history/sim/people/family/starting/types"

export interface FamilyCapture {
	peakInitializationHeapBytes: number
	skeleton: Anchor[]
	detach: () => void
}

export interface FamiliesReportParams {
	engine: HistoryState
	peopleRecord: PeopleRecord
	capture: FamilyCapture
}

export interface FamiliesReport extends StartingFamilies {
	people: number
	living: number
	dead: number
	holders: { sovereign: number; district: number; patrician: number }
	heirsMissing: number
	dynastyRoots: number
	dynasties: number
	singletonDynasties: number
	occupiedHouseDynasties: number
	sharedHouseDynasties: number
	priorMarriages: number
	kin: {
		children: number
		grandchildren: number
		siblings: number
		nephews: number
	}
	rejectedCandidatesLiving: number
	rejectedCandidatesDead: number
	retainedBytes: {
		people: number
		record: number
		rejectedCandidateColumns: number
		skeleton: number
	}
	peakInitializationHeapBytes: number
	memoryMeasurementMs: number
}

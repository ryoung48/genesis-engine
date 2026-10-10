import type {
	PartitionNoteData,
	PartitionSkipReason,
	UnseatedReason,
} from "@/model/history/sim/engine/events/succession/partition/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { Distribution } from "@/test/history-run/report/distribution/types"

export interface PartitionStateParams {
	engine: HistoryState
}

export interface TribalRealms {
	count: number
	medianProvinces: number
	medianPopulation: number
}

// Read from engine state alone, so it has a value before any realm partitions.
export interface PartitionStateReport {
	// Held titles over all titles, by tier name from duchy upward.
	heldTitleShare: Record<string, number>
	// The same for titles whose seat lies in a realm that partitions.
	heldTitleSharePartitioning: Record<string, number>
	tribalMonarchies: TribalRealms
	chiefdoms: TribalRealms
}

export type PartitionTagKind = "primary" | "heir"

// A realm the report follows: a root plus the partition that created or kept
// it. A root alone is no identity, since it can be absorbed and released again.
export interface PartitionTag {
	root: number
	partition: number
	kind: PartitionTagKind
	generation: number
	startYear: number
}

export interface TrackedPartition {
	year: number
	generation: number
	regencies: number
	data: PartitionNoteData
}

export interface TrackedSkip {
	year: number
	reason: PartitionSkipReason
}

export type HeirRealmFate =
	| "mergedByUnion"
	| "absorbedBySibling"
	| "absorbedByOther"
	| "partitionedAgain"

export interface TrackedFate {
	year: number
	fate: HeirRealmFate
	samePartition: boolean
	lifetimeYears: number
}

export interface PendingAbsorption {
	tag: PartitionTag
	year: number
}

export interface PartitionTracker {
	// Engine notes already read.
	cursor: number
	tags: Map<number, PartitionTag>
	partitions: TrackedPartition[]
	skips: TrackedSkip[]
	fates: TrackedFate[]
	siblingWarYears: number[]
	siblingUnionYears: number[]
}

export interface ObserveParams {
	engine: HistoryState
	tracker: PartitionTracker
}

export interface EndTagParams {
	tracker: PartitionTracker
	tag: PartitionTag
	year: number
	fate: HeirRealmFate
	samePartition: boolean
}

export interface SiblingParams {
	tracker: PartitionTracker
	a: number
	b: number
}

export interface SummarizeParams {
	engine: HistoryState
	tracker: PartitionTracker
	from: number
	to: number
	// Wall time spent dividing realms in the window.
	divideMs: number
}

export interface HeirRealmFates {
	mergedByUnion: number
	mergedByUnionSamePartition: number
	absorbedBySibling: number
	absorbedByOther: number
	partitionedAgain: number
	// Heir realms still sovereign at the end of the window.
	standingInUnion: number
	standingInUnionSamePartition: number
	standingAlone: number
	// Of realms merged or absorbed in the window.
	medianLifetimeYears: number
}

export interface PartitionReport {
	titleShares: number
	districtShares: number
	partitions: number
	skipped: Record<PartitionSkipReason, number>
	// Partitions over partitions plus skips.
	rate: number
	heirsSeated: number
	heirsUnseated: Record<UnseatedReason, number>
	newRealms: Distribution
	primaryPopulationShare: Distribution
	primaryProvinceShare: Distribution
	largestJuniorShare: Distribution
	effectiveRealms: Distribution
	// Heir realms whose top tier equals the primary realm's, over all of them.
	sameTierShare: number
	titlesLost: Record<string, number>
	primaryRankDrops: number
	fates: HeirRealmFates
	siblingWars: number
	siblingUnions: number
	generation: Distribution
	maxGeneration: number
	regencies: number
	adminsSeatedVacant: number
	adminsBumped: number
	adminsLandless: number
	joinedDistricts: number
	releasedRealms: number
	releasedPopulationShare: Distribution
	divideMs: number
}

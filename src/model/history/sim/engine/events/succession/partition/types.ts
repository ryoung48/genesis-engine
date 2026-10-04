import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { PeopleState } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface DivideParams {
	state: HistoryState
	realm: number
	dying: number
	primary: number
	// The primary heir's seat before they took the throne; -1 for none.
	primarySeat: number
	rng: SharedRng
}

export type PartitionSkipReason =
	| "not child line"
	| "no junior heir"
	| "no free seat"

export type UnseatedReason =
	| "no seat"
	| "reserved seat unavailable"
	| "share dropped"

export type PartitionRealmKind = "primary" | "heir" | "released"

export interface PartitionShare {
	heir: number
	seat: number
}

// A living admin who lost a seat, with the rank the seat had before the
// division.
export interface DisplacedHolder {
	person: number
	seat: number
	rank: number
}

export interface UnseatedHeir {
	heir: number
	reason: UnseatedReason
}

export interface AdminMove {
	person: number
	from: number
	// -1 for landless.
	to: number
	bumped: boolean
}

export interface JoinedDistrict {
	district: number
	realm: number
}

// The realm as it stood before any release.
export interface PartitionSnapshot {
	provinces: number[]
	population: number
	seatRank: Uint8Array
	// Held seats other than the realm root.
	seats: number[]
	titleHolder: Int32Array
}

export interface PartitionRun {
	state: HistoryState
	realm: number
	rng: SharedRng
	snapshot: PartitionSnapshot
	released: PartitionShare[]
	displaced: DisplacedHolder[]
	unseated: UnseatedHeir[]
	joined: JoinedDistrict[]
	moves: AdminMove[]
}

export interface RealmParams {
	state: HistoryState
	realm: number
}

export interface SeatParams {
	state: HistoryState
	seat: number
}

export interface BranchParams {
	people: PeopleState
	dying: number
	person: number
}

export interface JuniorHeirsParams {
	state: HistoryState
	realm: number
	dying: number
	// The child of the late ruler whose line the primary heir belongs to.
	branch: number
}

export interface PrimarySeatParams {
	state: HistoryState
	realm: number
	primary: number
	primarySeat: number
}

export interface AssignParams {
	state: HistoryState
	realm: number
	excludedSeat: number
	unseated: UnseatedHeir[]
	heirs: number[]
}

export interface ProjectPartitionParams {
	state: HistoryState
	realm: number
	dying: number
	primary: number
}

export interface ReleaseParams {
	run: PartitionRun
	share: PartitionShare
}

export interface PieceParams {
	run: PartitionRun
	piece: number
}

export interface DemoteParams {
	run: PartitionRun
	displaced: DisplacedHolder
}

export interface NoteParams {
	run: PartitionRun
	dying: number
	primary: number
}

export interface SkipParams {
	state: HistoryState
	realm: number
	dying: number
	primary: number
	reason: PartitionSkipReason
}

export type PartitionSkippedNoteData = {
	nation: number
	dying: number
	primary: number
	government: string
	reason: PartitionSkipReason
}

// Parallel arrays: heirs/seats per new realm in release order; realm* per
// sovereign realm owning a snapshot province afterwards; admin* per moved
// admin; joined* per cut-off district that passed to an heir realm; unseated*
// per junior heir without a realm; titlesLost* per title left without holder.
export type PartitionNoteData = {
	nation: number
	dying: number
	primary: number
	government: string
	primaryRankBefore: number
	populationBefore: number
	provincesBefore: number
	heirs: number[]
	seats: number[]
	realms: number[]
	realmKind: PartitionRealmKind[]
	realmPopulation: number[]
	realmProvinces: number[]
	realmRank: number[]
	adminPersons: number[]
	adminFrom: number[]
	adminTo: number[]
	adminBumped: number[]
	joinedDistricts: number[]
	joinedRealms: number[]
	unseatedHeirs: number[]
	unseatedReasons: UnseatedReason[]
	titlesLost: number[]
	titlesLostTier: number[]
}

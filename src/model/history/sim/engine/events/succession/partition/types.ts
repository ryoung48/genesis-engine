import type { RulerRef } from "@/model/history/record/rulers/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface DivideParams {
	state: HistoryState
	realm: number
	// Junior heirs the realm divides among; 0 for none.
	juniors: number
	late: RulerRef
	primary: RulerRef
	rng: SharedRng
}

export type PartitionSkipReason = "no junior heir" | "no free seat"

export type UnseatedReason = "no seat" | "share dropped"

export type PartitionRealmKind = "primary" | "heir" | "released"

export interface PartitionShare {
	kind: "title" | "district"
	supporters: number[]
	seat: number
}

export interface ReleasedShare extends PartitionShare {
	ruler: RulerRef
}

export interface UnseatedShare {
	reason: UnseatedReason
}

export interface JoinedDistrict {
	district: number
	realm: number
}

// The realm as it stood before any release.
export interface PartitionSnapshot {
	provinces: number[]
	population: number
	topTier: number
	titleHolder: Int32Array
}

export interface PartitionRun {
	state: HistoryState
	realm: number
	rng: SharedRng
	snapshot: PartitionSnapshot
	late: RulerRef
	released: ReleasedShare[]
	unseated: UnseatedShare[]
	joined: JoinedDistrict[]
}

export interface RealmParams {
	state: HistoryState
	realm: number
}

export interface AllocateParams {
	state: HistoryState
	realm: number
	unseated: UnseatedShare[]
	count: number
}

export interface ReleaseParams {
	run: PartitionRun
	share: PartitionShare
}

export interface PieceParams {
	run: PartitionRun
	piece: number
}

export interface NoteParams {
	run: PartitionRun
	primary: RulerRef
}

export interface SkipParams {
	state: HistoryState
	realm: number
	late: RulerRef
	primary: RulerRef
	reason: PartitionSkipReason
}

// Parallel arrays: heir* ruler columns and seats per new realm in release
// order; realm* per sovereign realm owning a snapshot province afterwards;
// joined* per cut-off district that passed to an heir realm; unseated* per
// junior heir without a realm; titlesLost* per title left without holder.
export type PartitionNoteData = {
	nation: number
	government: string
	primaryRankBefore: number
	populationBefore: number
	provincesBefore: number
	seats: number[]
	shareKind: ("title" | "district")[]
	realms: number[]
	realmKind: PartitionRealmKind[]
	realmPopulation: number[]
	realmProvinces: number[]
	realmRank: number[]
	joinedDistricts: number[]
	joinedRealms: number[]
	unseatedReasons: UnseatedReason[]
	titlesLost: number[]
	titlesLostTier: number[]
}

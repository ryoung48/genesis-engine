import type { Pregnancy } from "@/model/history/sim/people/fertility/types"
import type { PeopleLogKind } from "@/model/history/sim/people/log/types"
import type { PeopleState } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface BackfillSeat {
	seat: number
	culture: number
	dynasty: number
	standing: number
}

export interface BackfillParams {
	seats: BackfillSeat[]
	seatRank: Uint8Array
	seatCount: number
	start: number
	years: number
	seed: number
}

export interface BackfillResult {
	people: PeopleState
	pending: Pregnancy[]
}

export interface BackfillContext {
	people: PeopleState
	start: number
	rng: SharedRng
	nextDynasty: number
	pending: Pregnancy[]
}

export interface BackfillPersonParams {
	context: BackfillContext
	sex: 0 | 1
	birth: number
	minimumSurvival: number
	requireAlive: boolean
	// [JUSTIFICATION] Founders and outsiders have no father.
	father?: number
	// [JUSTIFICATION] Founders and outsiders have no mother.
	mother?: number
	dynasty: number
	culture: number
	residence: number
}

export interface BackfillFamilyParams {
	context: BackfillContext
	person: number
	grandchildren: boolean
}

export interface BackfillCoupleParams {
	context: BackfillContext
	husband: number
	wife: number
	marriageTime: number
	includeGrandchildren: boolean
}

export interface BackfillSeatParams {
	context: BackfillContext
	seat: BackfillSeat
	seatRank: Uint8Array
}

export interface ValidateBackfillParams {
	people: PeopleState
	start: number
	seats: BackfillSeat[]
}

export interface BackfillLogRow {
	time: number
	kind: PeopleLogKind
	a: number
	b: number
	c: number
	d: number
}

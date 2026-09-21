import type { Pregnancy } from "@/model/history/sim/people/fertility/types"
import type { PeopleLogState } from "@/model/history/sim/people/log/types"
import type { Wedding } from "@/model/history/sim/people/marriage/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type Sex = 0 | 1

export interface PersonTable {
	count: number
	capacity: number
	growths: number
	sex: Uint8Array
	birth: Float32Array
	death: Float32Array
	deathSerial: Uint8Array
	deathCause: Uint8Array
	health: Uint8Array
	father: Int32Array
	mother: Int32Array
	dynasty: Int32Array
	culture: Int16Array
	residence: Int32Array
	firstMarriage: Int32Array
	fertility: Float32Array
	seat: Int32Array
	firstChild: Int32Array
	nextSiblingFather: Int32Array
	nextSiblingMother: Int32Array
	nextBirth: Float32Array
	peak: Uint8Array
	alive: Int32Array
	aliveCount: number
}

export interface MarriageTable {
	count: number
	capacity: number
	growths: number
	husband: Int32Array
	wife: Int32Array
	kind: Uint8Array
	start: Float32Array
	end: Float32Array
	endReason: Uint8Array
	matrilineal: Uint8Array
	nextOfHusband: Int32Array
	nextOfWife: Int32Array
}

export interface PeopleState {
	persons: PersonTable
	marriages: MarriageTable
	pendingPregnancies: Map<number, Pregnancy>
	log: PeopleLogState
	holderOfSeat: Int32Array
	nextSeatOfHolder: Int32Array
	nextDynasty: number
}

export interface CreatePeopleParams {
	capacity: number
	marriageCapacity: number
	seatCount: number
}

export interface AssignSeatParams {
	people: PeopleState
	person: number
	seat: number
	seatRank: Uint8Array
}

export interface RemoveSeatParams {
	people: PeopleState
	seat: number
}

export interface AddPersonParams {
	people: PeopleState
	sex: Sex
	birth: number
	// [JUSTIFICATION] Backfill creates parents who died before the simulation starts.
	death?: number
	// [JUSTIFICATION] Founders and outsiders have no father.
	father?: number
	// [JUSTIFICATION] Founders and outsiders have no mother.
	mother?: number
	dynasty: number
	culture: number
	residence: number
	// [JUSTIFICATION] Backfill can supply health from a simulated life trajectory.
	health?: number
	// [JUSTIFICATION] Tests and backfill can set a known fertility.
	fertility?: number
	// [JUSTIFICATION] Otherwise fertility is drawn from the supplied stream.
	rng?: SharedRng
}

export interface PersonAtParams {
	people: PeopleState
	person: number
	time: number
}

export interface KinPairParams {
	people: PeopleState
	a: number
	b: number
}

export interface EndLifeParams extends PersonAtParams {}

export interface ApplyDeathParams extends PersonAtParams {
	serial: number
}

export interface CompactAliveParams {
	people: PeopleState
	time: number
}

export interface PersonRefParams {
	people: PeopleState
	person: number
}

export interface RunPeopleYearParams {
	people: PeopleState
	from: number
	sovereignOfResidence: Int32Array
	cultureOfResidence: Int16Array | Int32Array
	neighbors: Map<number, readonly number[]>
	rng: SharedRng
}

export interface PeopleYearResult {
	deaths: ScheduledDeath[]
	weddings: Wedding[]
	pregnancies: Pregnancy[]
}

export interface ScheduledDeath {
	person: number
	time: number
	serial: number
}

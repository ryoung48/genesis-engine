import type {
	DeathCause,
	PeopleLogChunk,
} from "@/model/history/sim/people/log/types"
import type { MarriageEndReason } from "@/model/history/sim/people/marriage/types"

export interface PeopleRecord {
	count: number
	capacity: number
	present: Uint8Array
	sex: Uint8Array
	birth: Float64Array
	death: Float64Array
	deathHealth: Uint8Array
	deathCause: (DeathCause | null)[]
	father: Int32Array
	mother: Int32Array
	dynasty: Int32Array
	culture: Int16Array
	firstChild: Int32Array
	nextSiblingFather: Int32Array
	nextSiblingMother: Int32Array
	firstMarriage: Int32Array
	lastHealth: Int32Array
	lastTenureOfPerson: Int32Array
	healthCount: number
	healthCapacity: number
	healthTime: Float64Array
	healthValue: Uint8Array
	healthPrevious: Int32Array
	marriageCount: number
	marriageCapacity: number
	husband: Int32Array
	wife: Int32Array
	marriageStart: Float64Array
	marriageEnd: Float64Array
	marriageReason: Uint8Array
	nextOfHusband: Int32Array
	nextOfWife: Int32Array
	tenureCount: number
	tenureCapacity: number
	tenurePerson: Int32Array
	tenureSeat: Int32Array
	tenureStart: Float64Array
	tenureEnd: Float64Array
	tenurePreviousOfSeat: Int32Array
	tenurePreviousOfPerson: Int32Array
	lastTenureOfSeat: Map<number, number>
	dynastyCulture: Map<number, number>
}

export interface AppendPeopleRowsParams {
	record: PeopleRecord
	chunk: PeopleLogChunk
}

export interface PeopleRecordPersonParams {
	record: PeopleRecord
	person: number
}

export interface PeopleRecordSeatParams {
	record: PeopleRecord
	seat: number
}

export interface HealthPoint {
	timeMs: number
	health: number
}

export interface MarriageView {
	husband: number
	wife: number
	startMs: number
	endMs: number | null
	reason: MarriageEndReason | null
}

export interface TenureView {
	person: number
	seat: number
	startMs: number
	endMs: number | null
}

export interface OpenTenureParams {
	record: PeopleRecord
	person: number
	seat: number
	timeMs: number
}

export interface CloseTenureParams extends OpenTenureParams {}

export interface ApplyRowParams {
	record: PeopleRecord
	chunk: PeopleLogChunk
	index: number
}

export interface AddPersonRowParams {
	record: PeopleRecord
	person: number
	birthMs: number
	father: number
	mother: number
	identity: number
}

export interface PushHealthParams {
	record: PeopleRecord
	person: number
	timeMs: number
	health: number
}

export interface EndPersonParams {
	record: PeopleRecord
	person: number
	timeMs: number
	health: number
	causeCode: number
}

export interface GrownParams<T> {
	array: T
	capacity: number
	fill: number
}

export interface MarriageViewParams {
	record: PeopleRecord
	marriage: number
}

export interface TenureViewParams {
	record: PeopleRecord
	tenure: number
}

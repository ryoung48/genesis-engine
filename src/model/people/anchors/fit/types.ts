import type { RulerRef } from "@/model/history/record/rulers/types"
import type { Lineage, RulerFact } from "@/model/people/anchors/types"
import type {
	Cast,
	Marriage,
	Person,
	Reservation,
	ReservationSource,
	ReservedChild,
} from "@/model/people/cast/types"

export interface ChildParams {
	cast: Cast
	parent: Person
	spec: ReservedChild
	birthMs: number
	source: ReservationSource
}

export interface GapParams {
	cast: Cast
	parent: Person
	spec: ReservedChild
	birthMs: number
}

export interface OriginParams {
	cast: Cast
	spec: ReservedChild
	birthMs: number
	tier: number
	key: string
	flagged: boolean
}

export interface CoupleParams {
	cast: Cast
	spec: ReservedChild
	birthMs: number
	tier: number
	key: string
}

export interface EnsureParentsParams {
	cast: Cast
	person: Person
}

export interface ReserveParams {
	cast: Cast
	owner: string
	spec: ReservedChild
	birthMs: number
	source: ReservationSource
}

export interface AttachParams {
	cast: Cast
	marriage: Marriage
	spec: ReservedChild
	birthMs: number
	revealed: boolean
}

export interface WindowParams {
	cast: Cast
	father: Person
	mother: Person
}

export interface BirthWindow {
	lo: number
	hi: number
}

export interface SoloWindowParams {
	cast: Cast
	parent: Person
}

export interface NoteParams {
	cast: Cast
	fact: RulerFact
	step: string
	first: boolean
}

export interface HusbandParams {
	cast: Cast
	wife: Person
	fact: RulerFact
}

export interface RevealParams {
	cast: Cast
	people: Person[]
	marriage: Marriage | null
}

export interface RulerSpecParams {
	ref: RulerRef
	survivesMs: number
}

export interface MarkParams {
	cast: Cast
	reservation: Reservation
}

export type { Lineage }

export interface SettleNowParams {
	cast: Cast
	parent: Person
	reservation: Reservation
}

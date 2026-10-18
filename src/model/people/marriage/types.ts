import type {
	Cast,
	Kinship,
	Marriage,
	MarriageKind,
	Person,
	PersonId,
	Reservation,
} from "@/model/people/cast/types"

export interface ExtendParams {
	cast: Cast
	id: PersonId
	untilMs: number
}

export interface OpenParams {
	cast: Cast
	husband: PersonId
	wife: PersonId
	startMs: number
	kind: MarriageKind
	betrothedMs: number | null
	kinship: Kinship | null
	revealedLater: boolean
}

export interface SearchParams {
	cast: Cast
	person: Person
	untilMs: number
}

export interface AttemptParams {
	cast: Cast
	owner: Person
	cursorMs: number
	salt: number
	forced: Reservation | null
	kind: MarriageKind
}

export interface CoverParams {
	cast: Cast
	person: Person
	fromMs: number
	toMs: number
}

export interface SettleParams {
	cast: Cast
	owner: Person
	startMs: number
	spouseBirthMs: number
	betrothedMs: number | null
	kind: MarriageKind
	exclusive: boolean
	forced: boolean
}

export interface WedParams {
	cast: Cast
	owner: Person
	spouse: Person
	startMs: number
	betrothedMs: number | null
	kind: MarriageKind
	exclusive: boolean
}

export interface KinshipParams {
	cast: Cast
	first: Person
	second: Person
}

export type KinshipResult = Kinship | "ancestor" | null

export interface BarParams {
	cast: Cast
	person: Person
}

export interface AllowedParams {
	cast: Cast
	first: Person
	second: Person
}

export interface BusyParams {
	cast: Cast
	person: Person
	startMs: number
	endMs: number
}

export interface DueParams {
	cast: Cast
	person: Person
	cursorMs: number
}

export interface PlaceParams {
	cast: Cast
	marriage: Marriage
	reservation: Reservation
}

export interface MarkUnfitParams {
	cast: Cast
	person: Person
	untilMs: number
}

export interface StandingParams {
	cast: Cast
	person: Person
	timeMs: number
}

export interface TypeAtParams {
	cast: Cast
	person: Person
	timeMs: number
}

export interface ExclusiveParams {
	person: Person
	marriage: Marriage
}

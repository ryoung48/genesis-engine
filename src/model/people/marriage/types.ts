import type { AnchoredCouple } from "@/model/people/anchors/types"
import type { PersonKey } from "@/model/people/keys/types"
import type { PeopleStore } from "@/model/people/store/types"

export type PregnancyOutcome =
	| "birth"
	| "miscarriage"
	| "stillbirth"
	| "childbirth death"

export interface Pregnancy {
	conceptionMs: number
	dueMs: number
	outcome: PregnancyOutcome
	twins: boolean
	anchored: boolean
	children: PersonKey[]
}

export interface MarriageChild {
	key: PersonKey
	birthMs: number
	anchored: boolean
}

export type Kinship = "sibling" | "half-sibling" | "uncle-niece" | "cousin"

export type MarriageKind = "anchored" | "free" | "tie" | "plural" | "concubine"

export interface Marriage {
	key: string
	husband: PersonKey
	wife: PersonKey
	startMs: number
	endMs: number
	kind: MarriageKind
	// [JUSTIFICATION] Only a marriage promised in childhood has a betrothal date.
	betrothedMs: number | null
	// [JUSTIFICATION] Only a marriage between relatives has a kinship.
	kinship: Kinship | null
	pregnancies: Pregnancy[]
	children: MarriageChild[]
}

export interface Chain {
	owner: PersonKey
	marriages: Marriage[]
}

export interface ChainParams {
	store: PeopleStore
	key: PersonKey
}

export interface AnchoredMarriageParams {
	store: PeopleStore
	couple: AnchoredCouple
}

export interface ByKeyParams {
	store: PeopleStore
	key: string
}

export interface FreeSearchParams {
	store: PeopleStore
	owner: PersonKey
	anchored: Marriage[]
}

export interface AttemptParams {
	store: PeopleStore
	owner: PersonKey
	anchored: Marriage[]
	cursor: number
	salt: number
	ordinal: number
}

export interface FinishParams {
	store: PeopleStore
	husband: PersonKey
	wife: PersonKey
	startMs: number
	endMs: number
	kinship: Kinship | null
	kind: MarriageKind
	betrothedMs: number | null
}

export interface WedParams {
	store: PeopleStore
	owner: PersonKey
	anchored: Marriage[]
	ordinal: number
	spouseBirthMs: number
	startMs: number
	betrothedMs: number | null
	kind: MarriageKind
	exclusive: boolean
	spouse: ConjuredSpouse
}

export type SettleSpouseParams = Omit<WedParams, "spouse">

export interface ConjuredSpouse {
	tier: number
	seat: number
	dynasty: number
	dynastyOrigin: number
}

export interface ClaimParams {
	store: PeopleStore
	owner: PersonKey
	anchored: Marriage[]
	candidate: PersonKey
	startMs: number
	kind: MarriageKind
	betrothedMs: number | null
	exclusive: boolean
}

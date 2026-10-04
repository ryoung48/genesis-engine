import type {
	HouseholdContext,
	ResidenceHistory,
} from "@/model/history/sim/people/household/types"
import type { PeopleLog } from "@/model/history/sim/people/log/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type Sex = 0 | 1

export type GenderPreference = "male" | "female" | "none"

export interface PersonTable {
	bases: number[]

	personality: number[]
	grades: number[]
	congenital: number[]
	carried: number[]
	stress: number[]
	sex: Sex[]
	birth: number[]
	death: number[]
	father: number[]
	mother: number[]
	spouse: number[]
	dynasty: number[]
	culture: number[]
	nameSeed: number[]
	residence: number[]
	initialResidence: number[]
	heldSeats: number[][]
	children: number[][]
	scopeYear: number[]
	marriedAt: number[]
	// Realm at birth; names are drawn from its culture.
	home: number[]
	// Base fertility, 0.5 to 0.6.
	fertility: number[]
	// Highest seat standing ever held; 0 for none.
	peak: number[]
	// Earliest next conception: the last pregnancy's end plus a rest.
	nextBirth: number[]
	// The promised partner, or -1; always set on both parties.
	betrothed: number[]
	// When the betrothal was made; -1 without one.
	betrothedAt: number[]
}

export type SeatChangeReason =
	| "succession"
	| "usurpation"
	| "rebellion"
	| "restoration"
	| "regime change"
	| "union"
	| "territorial change"
	| "district grant"
	| "partition"
	| "unknown"

export type RegentKind = "parent" | "relative" | "protector" | "council"

export interface Regency {
	ward: number
	// -1 for a regency council.
	regent: number
	kind: RegentKind
}

// A deposed ruler, or their heir, who may try to retake the throne.
export interface DeposedClaim {
	claimant: number
	// 0 for the deposed ruler, 1 for their heir.
	generation: number
	// The claimant has made their coming-of-age attempt.
	tried: boolean
}

export type PregnancyLoss = "miscarriage" | "stillbirth" | "childbirth death"

export interface PeopleState {
	household: HouseholdContext
	residenceHistory: Map<number, ResidenceHistory>
	holdingsChanged: (person: number) => void
	persons: PersonTable
	alive: number[]
	stressed: number[]
	rulerOf: Int32Array
	// Patrician house heads of each electoral republic, by realm.
	patricians: Map<number, number[]>
	// Successive shared rulers of each personal-union junior realm.
	unionGenerations: Map<number, number>
	// Realm pairs allied by a marriage between their ruling families, keyed by
	// the lower realm times the province count plus the higher.
	marriageAlliances: Map<number, MarriageAlliance>
	// Sovereign realms governed by a regent, by realm.
	regencies: Map<number, Regency>
	// Claims of deposed rulers, by the realm they lost.
	deposed: Map<number, DeposedClaim>
	log: PeopleLog
	nextDynasty: number
}

export interface AddPersonParams {
	people: PeopleState
	sex: Sex
	birth: number
	death: number
	father: number
	mother: number
	dynasty: number
	culture: number
	nameSeed: number
	realm: number
	fertility: number
}

export interface SpawnParams {
	people: PeopleState
	sex: Sex
	birth: number
	father: number
	mother: number
	dynasty: number
	origin: RealmOrigin
	rng: SharedRng
}

export interface PersonAtParams {
	people: PeopleState
	person: number
	time: number
}

export interface PersonRefParams {
	people: PeopleState
	person: number
}

export interface RealmOrigin {
	realm: number
	culture: number
	genderSystem: number
}

export interface FoundHouseParams {
	people: PeopleState
	origin: RealmOrigin
	time: number
	age: number
	// Tier of the seat the house is founded for; sets its family size.
	rank: number
	rng: SharedRng
}

export interface SetRulerParams {
	people: PeopleState
	seat: number
	person: number
	rank: number
	reason: SeatChangeReason
}

export interface RaiseParams {
	people: PeopleState
	person: number
	rank: number
}

export interface ShortenLifeParams {
	people: PeopleState
	person: number
	time: number
}

export interface SetRegentParams {
	people: PeopleState
	seat: number
	// -1 ends the regent's tenure.
	person: number
	ward: number
}

export interface VacateParams {
	people: PeopleState
	seat: number
	reason: SeatChangeReason
}

// The realm-level rules the marriage market reads from the engine.
export interface MarriageRealms {
	neighborsOf: (realm: number) => readonly number[]
	originOf: (realm: number) => RealmOrigin
	// Realms whose ruling houses marry abroad for alliance.
	royal: (realm: number) => boolean
	// The match would form or bind a marriage alliance.
	alliable: (match: CrossMatch) => boolean
}

export interface RunPeopleYearParams extends MarriageRealms {
	people: PeopleState
	time: number
	rulers: number[]
	sovereigns: number[]
	rng: SharedRng
}

export interface PeopleYear extends PeopleMatches {
	// People whose death date moved earlier this year.
	shortened: number[]
}

export interface PeopleMatches {
	weddings: CrossMatch[]
	betrothals: CrossMatch[]
}

export interface MarriageAlliance {
	first: number
	second: number
}

export interface CrossMatch {
	a: number
	b: number
	realmA: number
	realmB: number
}

export interface MarriageTieParams {
	people: PeopleState
	a: number
	b: number
	time: number
}

export interface NameSeedParams {
	sex: Sex
	genderSystem: number
	rng: SharedRng
}

export interface PreferenceParams {
	genderSystem: number
}

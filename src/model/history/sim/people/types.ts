import type { SharedRng } from "@/model/shared/random/rng"

export type Sex = 0 | 1

export type GenderPreference = "male" | "female" | "none"

export interface PersonTable {
	sex: Sex[]
	birth: number[]
	death: number[]
	father: number[]
	mother: number[]
	spouse: number[]
	dynasty: number[]
	culture: number[]
	nameSeed: number[]
	realm: number[]
	throne: number[]
	children: number[][]
	scopeYear: number[]
	marriedAt: number[]
	// Realm at birth; names are drawn from its culture.
	home: number[]
	recorded: boolean[]
}

export interface PeopleLogMarriage {
	husband: number
	wife: number
	start: number
}

export interface PeopleLogSeat {
	seat: number
	person: number
}

// Rows the journal has not yet taken: newly recorded people, marriages
// between recorded people, and seat holder changes.
export interface PeopleLog {
	persons: number[]
	marriages: PeopleLogMarriage[]
	seats: PeopleLogSeat[]
}

export interface PeopleState {
	persons: PersonTable
	alive: number[]
	rulerOf: Int32Array
	// Patrician house heads of each electoral republic, by realm.
	patricians: Map<number, number[]>
	// Successive shared rulers of each personal-union junior realm.
	unionGenerations: Map<number, number>
	// Realm pairs allied by a marriage between their ruling families, keyed by
	// the lower realm times the province count plus the higher.
	marriageAlliances: Map<number, MarriageAlliance>
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
	rng: SharedRng
}

export interface ThroneParams {
	people: PeopleState
	person: number
	seat: number
	realm: number
}

export interface SetRulerParams {
	people: PeopleState
	seat: number
	person: number
}

export interface VacateParams {
	people: PeopleState
	seat: number
}

export interface RunPeopleYearParams {
	people: PeopleState
	time: number
	rulers: number[]
	neighborsOf: (realm: number) => readonly number[]
	originOf: (realm: number) => RealmOrigin
	// Realms whose ruling houses marry abroad for alliance.
	royal: (realm: number) => boolean
	sovereigns: number[]
	rng: SharedRng
}

export interface MarriageAlliance {
	first: number
	second: number
}

export interface CrossWedding {
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

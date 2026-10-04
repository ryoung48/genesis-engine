import type {
	PeopleRandomSource,
	RealmOrigin,
	Sex,
} from "@/model/history/sim/people/types"

export interface KeyParams {
	seed: number
	path: number[]
}

export interface SourceParams extends KeyParams {
	purpose: number
}

export interface DrawParams extends KeyParams {
	sex: Sex
	origin: RealmOrigin
}

export interface AgeParams {
	rng: PeopleRandomSource
}

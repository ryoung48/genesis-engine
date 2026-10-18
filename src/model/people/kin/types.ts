import type { PersonKey } from "@/model/people/keys/types"
import type { Kinship, Marriage } from "@/model/people/marriage/types"
import type { PeopleStore } from "@/model/people/store/types"
import type { PersonStub } from "@/model/people/stub/types"

export interface KinParams {
	store: PeopleStore
	key: PersonKey
}

export interface Pair {
	first: PersonStub
	second: PersonStub
	kinship: Kinship
}

export interface SettleParams {
	store: PeopleStore
	pairs: Pair[]
	lower: (stub: PersonStub) => Marriage[]
}

export interface Span {
	startMs: number
	endMs: number
}

export interface EarliestParams {
	store: PeopleStore
	pair: Pair
	busy: (stub: PersonStub) => Span[]
}

export interface BarParams {
	store: PeopleStore
	stub: PersonStub
}

export interface GroupParams {
	store: PeopleStore
	marriage: Marriage
}

export interface ParentGroupParams {
	store: PeopleStore
	key: PersonKey
}

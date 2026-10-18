import type { AnchoredChild, Lineage } from "@/model/people/anchors/types"
import type { Marriage } from "@/model/people/marriage/types"
import type { PeopleStore } from "@/model/people/store/types"
import type { PersonStub } from "@/model/people/stub/types"

export interface CoupleParams {
	store: PeopleStore
	marriage: Marriage
	anchored: AnchoredChild[]
}

export interface SmoothWeightParams {
	health: number
	earlier: number
}

export interface ChildLineageParams {
	husband: PersonStub
	wife: PersonStub
}

export interface CapParams {
	husband: PersonStub
	wife: PersonStub
	seed: number
}

export type { Lineage }

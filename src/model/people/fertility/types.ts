import type { Lineage } from "@/model/people/anchors/types"
import type {
	Cast,
	Marriage,
	Person,
	PersonId,
} from "@/model/people/cast/types"

export interface AdvanceParams {
	cast: Cast
	marriage: Marriage
	untilMs: number
}

export interface SmoothWeightParams {
	health: number
	earlier: number
}

export interface ChildLineageParams {
	husband: Person
	wife: Person
}

export interface CapParams {
	husband: Person
	wife: Person
	seed: number
}

export interface CanBearParams {
	cast: Cast
	marriage: Marriage
	birthMs: number
}

export interface PlanBirthParams {
	marriage: Marriage
	child: PersonId
	birthMs: number
}

export interface EndOfParams {
	cast: Cast
	marriage: Marriage
}

export interface LivingParams {
	cast: Cast
	marriage: Marriage
	timeMs: number
}

export type { Lineage }

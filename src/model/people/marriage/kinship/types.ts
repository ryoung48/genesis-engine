import type { Cast, Kinship, Person } from "@/model/people/cast/types"

export type KinshipResult = Kinship | "ancestor" | null

export interface KinshipParams {
	cast: Cast
	first: Person
	second: Person
}

export interface BarParams {
	cast: Cast
	person: Person
}

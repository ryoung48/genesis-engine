import type { PlacementStep, RulerFact } from "@/model/people/anchors/types"
import type { Cast, Person } from "@/model/people/cast/types"

export interface StepParams {
	cast: Cast
	late: Person
	lateFact: RulerFact
	fact: RulerFact
}

export type Step = (params: StepParams) => Person | null

export interface LadderStep {
	name: PlacementStep
	run: Step
}

export interface RulerParams {
	cast: Cast
	rulerId: number
}

export interface SiblingParams {
	cast: Cast
	of: Person
	deadlineMs: number
	key: string
}

export interface HusbandParams {
	cast: Cast
	wife: Person
	fact: RulerFact
}

export interface LadderParams {
	cast: Cast
	fact: RulerFact
}

import type {
	Attribute,
	AttributeModifier,
} from "@/model/history/sim/people/attributes/types"
import type { PeopleState } from "@/model/history/sim/people/types"

export type AgeCondition =
	| "infirm"
	| "clouded_eyes"
	| "fragile_bones"
	| "withering_mind"
	| "faltering_heart"

export type HealthCondition = AgeCondition | "blind" | "incapable"

// Levels attained on a condition's track; Blind and Incapable are present at 0.
export type ConditionLevel = 0 | 1 | 2 | 3 | 4

// One entry per health condition in code order: its level, or -1 when absent.
export type ConditionLevels = readonly number[]

// What one base or level row of a condition contributes.
export interface ConditionRow {
	additions: Partial<Record<Attribute, number>>
	percentages: Partial<Record<Attribute, number>>
	health: number
	fertility: number
	attraction: number
	advantage: number
	// Years of life expectancy lost, applied as added physiological age.
	life: number
}

// The summed rows of every condition a person has.
export interface ConditionEffects {
	attributes: AttributeModifier
	health: number
	// Multiplies fertility; never below 0.
	fertility: number
	attraction: number
	advantage: number
	ageingShift: number
}

export interface ConditionChange {
	// Index into the health conditions in code order.
	condition: number
	before: number
	after: number
}

export interface AgeingPersonParams {
	people: PeopleState
	person: number
}

export interface AgeingStepParams extends AgeingPersonParams {
	// The completed age-year being processed.
	age: number
	// Effective health after the year's ageing loss.
	health: number
	prowess: number
	// The person led an army since their last pulse.
	led: boolean
}

export interface OnsetChanceParams {
	// Index of the ageing condition.
	condition: number
	age: number
	health: number
}

export interface ProgressOption {
	xp: number
	weight: number
}

export interface ProgressParams {
	condition: number
	age: number
	health: number
	prowess: number
	led: boolean
}

export interface LevelChangeParams {
	condition: number
	before: number
	after: number
	changes: ConditionChange[]
}

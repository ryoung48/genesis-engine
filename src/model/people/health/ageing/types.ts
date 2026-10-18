export type AgeCondition =
	| "infirm"
	| "clouded_eyes"
	| "fragile_bones"
	| "withering_mind"
	| "faltering_heart"

export type HealthCondition = AgeCondition | "blind" | "incapable"

export interface AgeingState {
	xp: number[]
	blind: boolean
	incapable: boolean
}

export interface ConditionRow {
	health: number
	fertility: number
	life: number
}

export interface ConditionEffects {
	health: number
	fertility: number
	ageingShift: number
}

export interface ConditionChange {
	condition: number
	before: number
	after: number
}

export interface AgeingStepParams {
	state: AgeingState
	seed: number
	age: number
	health: number
}

export interface OnsetChanceParams {
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
}

export interface LevelChangeParams {
	condition: number
	before: number
	after: number
	changes: ConditionChange[]
}

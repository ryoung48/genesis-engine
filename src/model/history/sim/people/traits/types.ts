import type { Attribute } from "@/model/history/sim/people/attributes/types"
import type { PersonTable } from "@/model/history/sim/people/types"
export type PersonalityTrait =
	| "brave"
	| "craven"
	| "ambitious"
	| "content"
	| "wrathful"
	| "calm"
	| "just"
	| "arbitrary"
	| "diligent"
	| "lazy"
	| "generous"
	| "greedy"
	| "lustful"
	| "chaste"
	| "temperate"
	| "gluttonous"
	| "patient"
	| "impatient"
	| "humble"
	| "arrogant"
	| "honest"
	| "deceitful"
	| "gregarious"
	| "shy"
	| "zealous"
	| "cynical"
	| "trusting"
	| "paranoid"
	| "forgiving"
	| "vengeful"
	| "compassionate"
	| "callous"
	| "sadistic"
	| "stubborn"
	| "fickle"
	| "eccentric"
export type CongenitalTrait =
	| "giant"
	| "dwarf"
	| "clubfooted"
	| "hunchbacked"
	| "spindly"
	| "lisping"
	| "stuttering"
	| "bleeder"
	| "wheezing"
	| "infertile"
	| "scaly"
	| "albino"
	| "depressed"
	| "lunatic"
	| "possessed"
export type Grade = -3 | -2 | -1 | 0 | 1 | 2 | 3
export type GeneState = "active" | "carried" | "none"
export type Ladder = "intellect" | "physique" | "beauty"
export interface Character {
	bases: number

	personality: number
	grades: number
	congenital: number
	carried: number
}
export interface DrawTraitsParams {
	table: PersonTable
	person: number
}
export interface TraitAtParams {
	character: Character
	age: number
}
export interface IncomeParams extends TraitAtParams {
	stressLevel: number
}
export interface GradeParams {
	character: Pick<Character, "grades">
	ladder: Ladder
}
export interface GradeValues {
	active: Grade
	good: number
	bad: number
}
export interface InheritParams {
	seed: number
	channel: number
	first: GeneState
	second: GeneState
	birth: number
	reduction: number
}
export interface GeneResult {
	active: boolean
	carried: boolean
}
export interface LadderDrawParams {
	seed: number
	channel: number
	first: GradeValues
	second: GradeValues
	birth: number[]
}
export interface TraitDefinition {
	name: PersonalityTrait | CongenitalTrait
	values: number[]
	health: number
	fertility: number
	attraction: number
	opinion: number
	vassalOpinion: number
	stressGain: number
	stressLoss: number
	warChance: number
	income: number
}

export interface StressModifier {
	gain: number
	loss: number
}
export interface StressFactorsParams extends TraitAtParams {
	conditions: readonly StressModifier[]
}

export type TraitRow = readonly [
	PersonalityTrait | CongenitalTrait,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
]

export type ScalarTraitModifier = Exclude<
	keyof TraitDefinition,
	"name" | "values"
>
export interface TraitModifierParams extends TraitAtParams {
	modifier: ScalarTraitModifier | Attribute
}
export interface TraitHasParams extends TraitAtParams {
	trait: PersonalityTrait
}

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
	personality: number
	grades: number
	congenital: number
	carried: number
}

export interface DrawCharacterParams {
	seed: number
	first: Character | null
	second: Character | null
}

export interface CharacterAtParams {
	character: Character
	age: number
}

export interface GradeParams {
	character: Pick<Character, "grades">
	ladder: Ladder
}

export interface GradeTrait {
	label: string
	grade: Grade
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
	health: number
	fertility: number
}

export type TraitRow = readonly [
	PersonalityTrait | CongenitalTrait,
	number,
	number,
]

export interface CompatibilityParams {
	first: CharacterAtParams
	second: CharacterAtParams
}

export interface DrawPersonalityParams {
	seed: number
	parents: (Character | null)[]
}

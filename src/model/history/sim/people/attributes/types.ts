import type {
	Character,
	DrawTraitsParams,
	TraitAtParams,
} from "@/model/history/sim/people/traits/types"
export type Attribute =
	| "diplomacy"
	| "martial"
	| "stewardship"
	| "intrigue"
	| "learning"
	| "prowess"
export type AttributeTier =
	| "Terrible"
	| "Poor"
	| "Average"
	| "Good"
	| "Excellent"
export type EducationLevel = 1 | 2 | 3 | 4
export interface AttributeModifier {
	additions: Record<Attribute, number>
	percentages: Record<Attribute, number>
	incapable: boolean
}
export interface EffectiveParams extends TraitAtParams {
	conditions: readonly AttributeModifier[]
	attribute: Attribute
}
export interface EducationParams {
	character: Character
}
export interface Education {
	focus: Exclude<Attribute, "prowess">
	level: EducationLevel
}
export interface AttributeDrawParams extends DrawTraitsParams {
	character: Character
}

export interface BaseParams {
	character: Pick<Character, "bases">
	attribute: Attribute
}

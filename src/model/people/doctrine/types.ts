import type { PersonalityTrait } from "@/model/people/character/types"

export type MarriageType = "monogamy" | "polygamy" | "concubines"

export interface DoctrineGroup {
	name: string
	options: readonly string[]
}

export interface ReligionDoctrine {
	options: Uint8Array
	familyOptions: Uint8Array
	virtues: PersonalityTrait[][]
	sins: PersonalityTrait[][]
}

export interface AssignDoctrinesParams {
	religionTypes: Uint8Array
	religionFamilies: Int32Array
	familyCount: number
	seed: number
}

export interface DoctrineOfParams {
	religionTypes: Uint8Array
	religionFamilies: Int32Array
	seed: number
}

export interface MarriageTypeParams {
	doctrine: ReligionDoctrine
	religion: number
}

export interface PickParams {
	weights: readonly number[]
	roll: number
}

export interface WeightsParams {
	counts: readonly (readonly number[])[]
	type: number
}

export interface DoctrineProbabilityParams {
	group: number
	type: number
}

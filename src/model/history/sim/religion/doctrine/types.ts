import type { PersonalityTrait } from "@/model/history/sim/people/traits/types"
export interface MarriageLawParams {
	doctrine: ReligionDoctrine | undefined
	religion: number
}
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

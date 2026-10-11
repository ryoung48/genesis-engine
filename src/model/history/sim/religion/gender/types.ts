export interface WeightsParams {
	counts: readonly (readonly number[])[]
	type: number
}

export interface PickParams {
	weights: readonly number[]
	roll: number
}

export interface AssignGenderParams {
	religionTypes: Uint8Array
	religionFamilies: Int32Array
	familyCount: number
	seed: number
}

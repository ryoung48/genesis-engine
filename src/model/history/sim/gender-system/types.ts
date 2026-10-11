export interface RestrictGenderSystemsParams {
	systems: Uint8Array
	cultureToReligion: Int32Array
	religionGender: Uint8Array | undefined
	seed: number
}
export interface AssignCultureGenderSystemsParams {
	count: number
	seed: number
}

export interface ResolveLeaderGenderParams {
	system: number | undefined | null
	seed: number
}

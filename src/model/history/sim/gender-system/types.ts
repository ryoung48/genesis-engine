import type { ReligionDoctrine } from "@/model/history/sim/religion/doctrine/types"
export interface RestrictGenderSystemsParams {
	systems: Uint8Array
	cultureToReligion: Int32Array
	doctrine: ReligionDoctrine | undefined
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

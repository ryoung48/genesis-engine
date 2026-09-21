import type { GenesisPartition } from "@/model/society/types"

export interface ComputeReligionsParams {
	cultures: GenesisPartition
	seed: number
}

export type ReligionGenderDoctrine =
	| "male_dominated"
	| "equal"
	| "female_dominated"

export interface AssignGenderDoctrinesParams {
	religionCount: number
}

export interface ComputeReligionFamiliesParams {
	religions: GenesisPartition
	seed: number
}

export interface AssignReligionTypesParams {
	religionCount: number
	religionFamilies: Int32Array
	religionFamilyCount: number
	cultureToReligion: Int32Array
	cultureCount: number
	provinceCount: number
	cultureAssignment: Int32Array
	/** [JUSTIFICATION] Nation government data is unavailable for worlds without state formation. */
	governmentType?: Uint8Array
	/** [JUSTIFICATION] Population migration is not computed for every world-generation path. */
	migrationWave?: Float32Array
	/** 1.0 = ancient era, 0.0 = information era */
	sizeWeight: number
	seed: number
}

import type { GenesisPartition, SocietyEra } from "@/model/society/types"

export interface ComputeReligionsParams {
	cultures: GenesisPartition
	seed: number
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
	// [JUSTIFICATION] Population migration is not computed for every world-generation path.
	migrationWave?: Float32Array
	era: SocietyEra
	seed: number
}

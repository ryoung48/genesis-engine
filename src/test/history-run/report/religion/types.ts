export interface GenderShareParams {
	religionTypes: Uint8Array | undefined
	religionGender: Uint8Array | undefined
}

export interface GenderReligionReportParams {
	systems: Uint8Array
	cultureToReligion: Int32Array
	religionGender: Uint8Array | undefined
	era: string
}

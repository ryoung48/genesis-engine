import type { ReligionDoctrine } from "@/model/history/sim/religion/doctrine/types"
export interface ReligionReportParams {
	religionTypes: Uint8Array | undefined
	religionFamilies: Int32Array | undefined
	religionDoctrine: ReligionDoctrine | undefined
}
export interface GenderReligionReportParams {
	systems: Uint8Array
	cultureToReligion: Int32Array
	doctrine: ReligionDoctrine | undefined
	era: string
}
export interface CorrelationParams {
	first: number[]
	second: number[]
}

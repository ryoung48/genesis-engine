import type { TitleTier } from "@/model/society/titles/types"
export interface Ruler {
	name: string
	dynasty: string | null
}

export interface NationRelations {
	overlord: number
	vassals: number[]
	vassalSubjectTypes: Array<{ nationId: number; subjectType: string }>
	unionSeniorOf: number[]
	unionJuniorPartner: number
	allies: number[]
	guarantees: number[]
	royalMarriages: number[]
	rivals: number[]
}

export interface NationFrame {
	id: number
	name: string
	color: readonly [number, number, number]
	capitalProvince: number
	government: string
	governmentReform: string
	// [JUSTIFICATION] A nation can be between rulers or awaiting a succession.
	ruler: Ruler | null
	birthTimeMs: number
	deathTimeMs: number
	relations: NationRelations
	wealth: number
	optimalWealth: number
	isEmperor: boolean
	isElector: boolean
	organizations: Array<{ orgId: string; role: string }>
}

export interface PartitionRow {
	id: number
	/** Raw EU4 identifier (e.g. "shamanism", "swedish") -- the key raw event
	 * data and the reference colour/name maps are keyed by. */
	key: string
	/** Display name from the reference data (e.g. "Fetishist", "Swedish"). */
	name: string
	color: readonly [number, number, number]
}

export interface WarFrame {
	id: number
	name: string
	rebel: boolean
	attackers: number[]
	defenders: number[]
	occupiedProvinces: number[]
}

export interface OrganizationFrame {
	orgId: string
	role: string
	province: number
}

export interface WorldFrame {
	timeMs: number
	provinceCount: number
	provinceNation: Int32Array
	provinceParent: Int32Array
	provinceController: Int32Array
	provinceCulture: Int32Array
	provinceReligion: Int32Array
	provinceCultureBlendSecondary: Int32Array
	provinceHre: Uint8Array
	provincePopulation: Float32Array
	provincePopulationUrban: Float32Array
	provinceDevelopment: Float32Array
	nations: Map<number, NationFrame>
	wars: WarFrame[]
	organizations: OrganizationFrame[]
	cultures: PartitionRow[]
	religions: PartitionRow[]
	nationCount: number
	totalPopulation: number
}

export interface IsOccupiedParams {
	frame: WorldFrame
	province: number
}

export interface HreMemberNationsParams {
	frame: WorldFrame
}

export interface OrgMemberProvincesParams {
	frame: WorldFrame
	orgId: string
}

export interface OrgForeignHoldersParams {
	frame: WorldFrame
	orgId: string
}

export interface RenderInputs {
	assignment: Int32Array
	seeds: Int32Array
	names: string[]
	cultureAssignment: Int32Array
	cultureCount: number
	cultureNames: string[]
	religionAssignment: Int32Array
	religionCount: number
	religionNames: string[]
	cultureByProvince: (string | null)[]
	religionByProvince: (string | null)[]
}

export interface ToRenderInputsParams {
	frame: WorldFrame
}

export interface ProvinceDepthParams {
	frame: WorldFrame
}

export interface ProvinceDomainParams {
	frame: WorldFrame
}

export interface ProvinceTierRealmParams {
	frame: WorldFrame
	tier: TitleTier
}

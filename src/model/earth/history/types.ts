import type { RawNationReference } from "./data-source"
import type { FoldedState } from "./fold"
import type { Eu4ProvinceMap } from "./import/eu4-province-map"

export interface LonLat {
	lon: number
	lat: number
}

export interface FoldedStateToGenesisFrameParams {
	state: FoldedState
	provinceMap: Eu4ProvinceMap
	nationReference?: Map<string, RawNationReference>
	cultureNameById?: Map<string, string>
	religionNameById?: Map<string, string>
	provinceCoords?: Map<string, LonLat>
}

export interface FindCentroidNearestProvinceParams {
	owned: number[]
	provinceMap: Eu4ProvinceMap
	provinceCoords: Map<string, LonLat>
}

export interface FoldedStateToNationInfoParams {
	state: FoldedState
	tag: string
}

export interface FoldAtCheckpointParams {
	cache: import("./checkpoint").CheckpointCache
	time: number
}

export interface HslToRgbParams {
	h: number
	s: number
	l: number
}

export interface DayOfYearParams {
	month: number
	day: number
}

export interface BlendRgbParams {
	a: readonly [number, number, number]
	b: readonly [number, number, number]
	t: number
}

export interface ListOrgMembersParams {
	state: FoldedState
	categorize: (
		rawProvinceId: number,
	) => { categoryId: string; striped: boolean } | null
}

export interface CreateMembershipCategorizerParams {
	orgId: string
	siteRoles: readonly string[]
}

export interface QueryEarthHistoryParams {
	engine: import("./engine").EarthHistoryEngine
	timeDays: number
	nationReference?: Map<string, RawNationReference>
	cultureNameById?: Map<string, string>
	religionNameById?: Map<string, string>
}

export interface QueryEarthHistoryNationParams {
	engine: import("./engine").EarthHistoryEngine
	timeDays: number
	tag: string
}

export interface FoldProvinceParams {
	rawId: string
	data: import("./fold").EarthHistoryData
	fromTime: number
	toTime: number
	base: import("./fold").FoldedProvinceState | undefined
}

export interface FoldNationParams {
	tag: string
	data: import("./fold").EarthHistoryData
	fromTime: number
	toTime: number
	base: import("./fold").FoldedNationState | undefined
}

export interface ApplyDiplomacyDeltaParams {
	data: import("./fold").EarthHistoryData
	fromTime: number
	toTime: number
	nations: Map<string, import("./fold").FoldedNationState>
}

export interface ApplyOrganizationDeltaParams {
	data: import("./fold").EarthHistoryData
	fromTime: number
	toTime: number
	nations: Map<string, import("./fold").FoldedNationState>
	organizationSites: Map<string, import("./fold").ActiveOrganizationSite>
}

export interface ComputeActiveWarsParams {
	wars: import("./data-source").RawWar[]
	time: number
}

export interface FoldParams {
	data: import("./fold").EarthHistoryData
	time: number
	options: {
		base?: import("./fold").FoldedState
		provinceIds: Iterable<string>
		nationTags: Iterable<string>
	}
}

export interface OrgParams {
	state: FoldedState
	orgId: string
}

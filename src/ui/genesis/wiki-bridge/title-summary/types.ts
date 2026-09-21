import type { WorldFrame } from "@/model/history/world-frame/types"

export interface DescribeNationTitlesParams {
	frame: WorldFrame
	nationId: number
	provinceName: (province: number) => string
}

export interface AdministrativeRegion {
	province: number
	provinceName: string
	tier: string
	color: string
}

export interface NationTitleSummary {
	tier: string
	regions: AdministrativeRegion[]
}

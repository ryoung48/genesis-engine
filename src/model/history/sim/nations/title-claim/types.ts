import type { DejureTitles, TitleMembers } from "@/model/society/dejure/types"

export interface TitleUnitParams {
	titles: DejureTitles
	members: TitleMembers
	provinceCount: number
	assignment: Int32Array
	province: number
	remaining: number
}

export interface TitleUnit {
	provinces: number[]
	title: number
}

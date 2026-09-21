import type { HistoryRecord, TitleBase } from "@/model/history/record/types"

export interface BuildTitleTimelineParams {
	record: HistoryRecord
	nationId: number
	nationName: string
	provinceName: (province: number) => string
}

export interface TitleTimelineEntry {
	id: string
	date: number
	type: string
	description: string
	provinces: number[]
}

export interface StartingHoldingsParams {
	base: TitleBase
	record: HistoryRecord
	nationId: number
}

import type { HistoryRecord } from "@/model/history/record/types"

export interface BuildRaidTimelineParams {
	record: HistoryRecord
	nationId: number
	nationName: string
	nationNameOf: (nationId: number) => string
	provinceName: (province: number) => string
}

export interface RaidTimelineEntry {
	id: string
	date: number
	type: string
	description: string
	otherNationId: number
	province: number
}

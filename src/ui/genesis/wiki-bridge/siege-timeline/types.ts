import type { SiegeBeat, WarRecord } from "@/model/history/record/types"
export interface BuildSiegeTimelineParams {
	war: WarRecord
	viewpoint: number | null
	nationNameOf: (nation: number) => string
	provinceName: (province: number) => string
}
export interface SiegeTimelineEntry {
	id: string
	date: number
	type: string
	description: string
	besiegerId: number
	defenderId: number
	provinceId: number
	warId: number
}
export interface BeatTextParams {
	beat: SiegeBeat
}

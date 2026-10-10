import type { WarRecord } from "@/model/history/record/types"

export interface CreateWarParams {
	id: number
	name: string
	attacker: number
	defender: number
	province: number
	rebel: boolean
	startTimeMs: number
	endTimeMs: number | null
}

export interface EndWarParams {
	war: WarRecord
	attacker: number
	defender: number
	timeMs: number
	comment: string | null
}

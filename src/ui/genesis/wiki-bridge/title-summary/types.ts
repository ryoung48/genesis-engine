import type { HistoryRecord } from "@/model/history/record/types"
import type { WorldFrame } from "@/model/history/world-frame/types"

export interface DescribeNationTitlesParams {
	record: HistoryRecord
	frame: WorldFrame
	nationId: number
	provinceName: (province: number) => string
}

export interface NationTitleSummary {
	tier: string
	// [JUSTIFICATION] An independent nation with no holder above it has no liege.
	liege: string | null
}

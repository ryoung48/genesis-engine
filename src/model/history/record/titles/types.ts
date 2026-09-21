import type {
	HistoryRecord,
	TitleBase,
	TitleEventRecord,
} from "@/model/history/record/types"
import type { TitleFrame, WorldFrame } from "@/model/history/world-frame/types"

export interface FoldTitlesParams {
	base: TitleBase
	events: TitleEventRecord[]
	provinceCount: number
	timeMs: number
}

export interface CreateTitleFrameParams {
	base: TitleBase
	capacity: number
}

export interface ApplyTitleEventParams {
	frame: TitleFrame
	provinceCount: number
	event: TitleEventRecord
}

export interface HolderRealmParams {
	frame: WorldFrame
	holder: number
}

export interface HolderRealmAtParams {
	record: HistoryRecord
	holder: number
	timeMs: number
}

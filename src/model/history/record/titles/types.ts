import type { TitleBase, TitleEventRecord } from "@/model/history/record/types"
import type { TitleFrame } from "@/model/history/world-frame/types"

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

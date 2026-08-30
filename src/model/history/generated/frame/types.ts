import type { HistoryState } from "@/model/history/generated/state/types"

export interface FrameAtParams {
	state: HistoryState
	timeMs: number
}

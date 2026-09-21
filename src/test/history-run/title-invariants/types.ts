import type { HistoryState as EngineState } from "@/model/history/sim/engine/state/types"

export interface EngineYearParams {
	engine: EngineState
	year: number
}

export interface TitleRealmParams {
	engine: EngineState
	title: number
}

export interface HighestTitleParams {
	engine: EngineState
	ruler: number
}

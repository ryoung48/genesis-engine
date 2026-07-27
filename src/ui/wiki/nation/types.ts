import type { HistoryNote } from "@/model/history/state/types"

export interface GrudgePhraseParams {
	pastEvents: HistoryNote[]
	attackerIdx: number
	defenderIdx: number
	currentWarIdx: number
	seed: number
}

export interface WarStreakPhraseParams {
	pastEvents: HistoryNote[]
	warIdx: number
	beforeTime: number
	viewingNation: number
	seed: number
}

export interface BuildProceduralWikiTimelineEventParams {
	event: HistoryNote
	viewingNation: number
	pastEvents: HistoryNote[]
	getNationName: (nationId: number) => string
	getNationColor: (nationId: number) => string | null
	index: number
}

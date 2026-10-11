import type { InterregnumNoteData } from "@/model/history/sim/engine/events/succession/interregnum/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { Distribution } from "@/test/history-run/report/distribution/types"

export interface TrackedInterregnum {
	year: number
	data: InterregnumNoteData
}

export interface InterregnumTracker {
	cursor: number
	events: TrackedInterregnum[]
	// Years of hereditary successions with no heir that freed no district.
	withoutDistricts: number[]
}

export interface ObserveInterregnumParams {
	engine: HistoryState
	tracker: InterregnumTracker
}

export interface SummarizeInterregnumParams {
	engine: HistoryState
	tracker: InterregnumTracker
	from: number
	to: number
}

export interface InterregnumReport {
	events: number
	freedPerEvent: Distribution
	skippedSeats: number
	warsDeclared: number
	cutOffProvinces: number
	titlesLost: number
	freedRealms: number
	freedStillSovereign: number
	withoutDistricts: number
}

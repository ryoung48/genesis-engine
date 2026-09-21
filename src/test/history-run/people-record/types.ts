import type { PeopleRecord } from "@/model/history/record/people/types"
import type { JournalTransaction } from "@/model/history/sim/engine/journal/types"
import type { HistoryState as EngineState } from "@/model/history/sim/engine/state/types"

export interface VerifyPeopleParams {
	engine: EngineState
	record: PeopleRecord
	year: number
}

export interface RowCoverageParams {
	engine: EngineState
	transactions: JournalTransaction[]
}

export interface DynastyCultureParams extends RowCoverageParams {
	record: PeopleRecord
}

export interface RowCounts {
	arrivals: number
	births: number
}

export interface NearParams {
	actual: number
	expected: number
}

import type { HistoryRecord } from "@/model/history/record/types"
import type { JournalHeirCreation } from "@/model/history/sim/engine/journal/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface ValidationTracker {
	// Violations found so far, by rule.
	violations: Record<string, number>
	// The first violation of each rule, kept to make a failure traceable.
	examples: Record<string, string>
	planCreations: Map<number, JournalHeirCreation>
	planCancellations: Set<number>
	planFulfillments: Set<number>
	planRecordCursors: Map<number, number>
	lastTransactionId: number
	serializedPlanBytes: number
}

export interface ValidateHeirsParams extends ValidateEngineParams {
	record: HistoryRecord
}

export interface ValidateEngineParams {
	engine: HistoryState
	tracker: ValidationTracker
}

export interface ViolationParams {
	tracker: ValidationTracker
	rule: string
	detail: string
}

import type { PeopleRecord } from "@/model/history/record/people/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface ValidationTracker {
	// Violations found so far, by rule.
	violations: Record<string, number>
	// The first violation of each rule, kept to make a failure traceable.
	examples: Record<string, string>
}

export interface ValidateEngineParams {
	engine: HistoryState
	tracker: ValidationTracker
}

export interface ValidateRecordParams extends ValidateEngineParams {
	people: PeopleRecord
}

export interface ViolationParams {
	tracker: ValidationTracker
	rule: string
	detail: string
}

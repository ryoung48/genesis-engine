export type OpinionMemoryReason =
	| "aid"
	| "abandonment"
	| "attack"
	| "usurpation"
	| "grant"
	| "coronation_uncrowned"
	| "coronation_humble"
	| "coronation_lavish"
	| "coronation_magnificent"

// Memories sharing a slot replace each other instead of adding up.
export type OpinionMemorySlot =
	| "aid"
	| "abandonment"
	| "attack"
	| "usurpation"
	| "grant"
	| "coronation"

// One remembered interaction; its strength is the reason's, so only the start
// in simulation years is kept.
export interface OpinionMemory {
	reason: OpinionMemoryReason
	start: number
}

export interface MemoryAtParams {
	memory: OpinionMemory
	time: number
}

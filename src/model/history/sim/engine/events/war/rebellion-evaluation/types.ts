import type { RebellionPreview } from "@/model/history/sim/engine/military/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

export type RebellionDecision = "threshold" | "random" | "accepted"
export interface RecordParams {
	state: HistoryState
	overlord: number
	subject: number
	seeded: boolean
	succession: boolean
	laxity: number
	// The holder's religion-excluded opinion of the ruler; null when either
	// is missing.
	holderOpinion: number | null
	// Whether the overlord carried the composite-realm penalty.
	composite: boolean
	threshold: number
	roll: number
	decision: RebellionDecision
	preview: RebellionPreview
}

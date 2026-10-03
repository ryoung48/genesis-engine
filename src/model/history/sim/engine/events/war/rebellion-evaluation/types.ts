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
	threshold: number
	roll: number
	decision: RebellionDecision
	preview: RebellionPreview
}

import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { AuditTally } from "@/test/history-run/succession-audit/types"

export interface PickSeatParams {
	state: HistoryState
	sovereign: boolean
	used: Set<number>
	accept: (tiers: number[]) => boolean
}

export interface ForceSuccessionParams {
	state: HistoryState
	seat: number
	law: string
	killKin: boolean
	tally: AuditTally
}

export interface SeatParams {
	state: HistoryState
	seat: number
}

export interface AddSonsParams extends SeatParams {
	count: number
}

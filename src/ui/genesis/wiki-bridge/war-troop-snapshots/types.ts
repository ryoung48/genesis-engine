import type {
	BattleContribution,
	WarRecord,
} from "@/model/history/record/types"
export interface SnapshotParams {
	war: WarRecord
	startTimeMs: number
	cutoffTimeMs: number
}
export interface TroopSnapshot {
	timeMs: number
	contributions: BattleContribution[]
}

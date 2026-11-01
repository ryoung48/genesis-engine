import type { Territory } from "@/model/history/distribution/territory/types"
import type { MigrationResult } from "@/model/society/migration/types"

export interface SettlementState {
	order: Int32Array
	arrivalYear: Int32Array
	capacities: number[]
	newlySettled: Int32Array
	cursor: number
}
export interface SeedSettlementParams {
	migration: MigrationResult
	componentCount: number
}
export interface SettledCountParams {
	settlement: SettlementState
	year: number
}
export interface StepSettlementParams {
	settlement: SettlementState
	territory: Territory
	year: number
}

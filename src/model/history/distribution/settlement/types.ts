import type { Territory } from "@/model/history/distribution/territory/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface SettlementState {
	order: Int32Array
	cursor: number
}
export interface SeedSettlementParams {
	provinces: GenesisProvinces
	migrationWave: Float32Array
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

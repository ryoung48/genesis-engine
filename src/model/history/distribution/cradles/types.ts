import type { MigrationResult } from "@/model/history/distribution/migration/types"
import type { GenesisProvinces } from "@/model/society/types"
export interface CradleChoice {
	province: number
	selectionYear: number
	arrivalYear: number
	residenceYears: number
	componentId: number
	nearestDistanceKm: number
}
export interface CradleState {
	schedule: CradleChoice[]
	cursor: number
	nearestId: Int32Array
	nearestDistanceKm: Float32Array
	spacingKm: number
}
export interface CradleParams {
	provinces: GenesisProvinces
	migration: MigrationResult
	siteScore: Float32Array
	r_xyz: Float32Array
	planetRadiusKm: number
}
export interface ActivateParams {
	cradles: CradleState
	provinces: GenesisProvinces
	r_xyz: Float32Array
	planetRadiusKm: number
	year: number
}
export interface HistoricalParams extends ActivateParams {}
export interface MatureScoreParams {
	siteScore: number
	arrivalYear: number
	year: number
}

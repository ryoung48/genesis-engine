import type { GenesisWorld } from "@/model/pipelines/types"
import type { FarmingHearth } from "@/model/society/farming/hearths/types"
import type { WayOfLife, WayOfLifeShares } from "@/model/society/farming/types"

export interface SampleQuantiles {
	samples: number
	p10: number | null
	p50: number | null
	p90: number | null
}

export type WayOfLifePercents = Record<WayOfLife, number | null>

export interface GroundReport {
	ploughMean: number | null
	terraceMean: number | null
	ploughBelowHalfPercent: number | null
	hillPercentOfLand: number | null
	mountainsPercentOfLand: number | null
}

export interface FarmingReport {
	scheduledHearths: number
	firedHearths: number
	firedPerMillionFarmableKm2: number | null
	firstFarmingYear: number | null
	hearths: FarmingHearth[]
	arrivalYears: SampleQuantiles
	yearsFromFirstHearthToP50: number | null
	yearsFromFirstHearthToP90: number | null
	landEdgeSpeedKmPerYear: SampleQuantiles
	pastoralYear: number
	livestockKnotYears: number[]
	settledProvinces: number
	neverReachedPercent: number | null
	neverAdoptingPercent: number | null
	adoptionLagYears: SampleQuantiles
	wayOfLifePercentAt: Record<string, WayOfLifePercents>
	ground: GroundReport
	meanSharesAtTechLevel: Record<string, WayOfLifeShares>
}

export interface FarmingReportParams {
	generated: GenesisWorld
}

export interface GroundReportParams {
	generated: GenesisWorld
	settled: number[]
}

export interface MeanSharesParams {
	generated: GenesisWorld
	settled: number[]
	techLevel: number
}

export interface QuantilesParams {
	values: number[]
}

export interface PercentParams {
	count: number
	total: number
}

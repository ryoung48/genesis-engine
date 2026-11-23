import type { GenesisWorld } from "@/model/pipelines/types"

export interface TechLevelReport {
	requested: number
	settledScore: number
	totalPopulation: number
	mean: number
	sd: number
	p5: number
	p50: number
	p99: number
	densitySpearman: number | null
	wattsPerPerson: number
	kardashev: number
	urbanSharePercent: number | null
}

export interface TechLevelReportParams {
	generated: GenesisWorld
}

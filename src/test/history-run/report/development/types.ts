import type { GenesisWorld } from "@/model/pipelines/types"

export interface DevelopmentReport {
	bandEdges: number[]
	landPercent: number[]
	peoplePercent: number[]
	landP50: number
	landP90: number
	landP99: number
}

export interface DevelopmentReportParams {
	generated: GenesisWorld
}

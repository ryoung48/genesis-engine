import type { GenesisWorld } from "@/model/pipelines/types"

export interface TerrainReport {
	marshShare: number
	tidalMaxForce: number | null
}

export interface TerrainReportParams {
	generated: Pick<GenesisWorld, "isLand" | "topography" | "tidalSchedule">
}

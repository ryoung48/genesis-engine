import type { TerrainSnapshot } from "@/model/pipelines/types"
import type { StageTiming } from "@/model/shared/timing/types"
import type {
	MapGeometryArrays,
	TerrainGeometryArrays,
} from "@/ui/genesis/renderer/terrain-geometry"

export type PreparedGeometry = {
	terrain: TerrainGeometryArrays
	map: MapGeometryArrays
	timings: StageTiming[]
}

export type GeometryPreparationInput = {
	onReady: (geometry: PreparedGeometry) => void
	onError: (error: Error) => void
}

export type GeometryWorkerResponse =
	| { type: "ready"; geometry: PreparedGeometry }
	| { type: "error"; message: string }

export type GeometryPreparation = {
	start: (terrain: TerrainSnapshot) => void
	result: Promise<PreparedGeometry | null>
	cancel: () => void
}

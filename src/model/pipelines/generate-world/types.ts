import type { COARSE_PLATES } from "@/model/geography/tectonics/coarse-plates"
import type {
	BoundaryInfo,
	DistanceFields,
	GenesisTerrainFeatures,
} from "@/model/geography/tectonics/types"
import type { ArcCrustRun } from "@/model/geography/terrain/arc-crust/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { PresentTectonics } from "@/model/pipelines/present-tectonics/types"
import type { GenesisParams, TerrainSnapshot } from "@/model/pipelines/types"
import type { StageTiming } from "@/model/shared/timing/types"

export interface TectonicPathResult {
	elevation: Float32Array
	terrainFeatures: GenesisTerrainFeatures | undefined
	boundary: BoundaryInfo
	distFields: DistanceFields
	arcRun: ArcCrustRun
	presentTectonics: PresentTectonics
}

export type ProgressFn = (label: string, pct?: number) => void

export interface ApplyPeakCompressionParams {
	elev: Float32Array
	N: number
}

export interface SummarizeHotspotExposureParams {
	hotspot: Float32Array
	beforeFloodLand: Uint8Array
	finalLand: Uint8Array
}

export interface GenerateGenesisWorldParams {
	params: GenesisParams
	onProgress?: ProgressFn
	// [JUSTIFICATION] Headless generation does not prepare a browser terrain preview.
	onTerrainReady?: (terrain: TerrainSnapshot) => void
}

export interface RunActivePathParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plateIds: number[]
	coarse: ReturnType<typeof COARSE_PLATES.generateCoarsePlates>
	params: GenesisParams
	pipelineTiming: StageTiming[]
	elevationTiming: StageTiming[]
	onProgress: ProgressFn | undefined
}

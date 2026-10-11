import type { COARSE_PLATES } from "@/model/geography/tectonics/coarse-plates"
import type {
	BoundaryInfo,
	DistanceFields,
	GenesisTerrainFeatures,
	TectonicPlate,
} from "@/model/geography/tectonics/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"
import type { StageTiming } from "@/model/shared/timing/types"

export interface TectonicPathResult {
	elevation: Float32Array
	terrainFeatures: GenesisTerrainFeatures | undefined
	boundary: BoundaryInfo
	distFields: DistanceFields
	r_hotspot: Float32Array
	r_mantleUpwelling: Float32Array
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
}

export interface RunActivePathParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plates: TectonicPlate[]
	plateIds: number[]
	coarse: ReturnType<typeof COARSE_PLATES.generateCoarsePlates>
	params: GenesisParams
	volcanism: number
	plateAssignment: Int32Array
	pipelineTiming: StageTiming[]
	elevationTiming: StageTiming[]
	onProgress: ProgressFn | undefined
}

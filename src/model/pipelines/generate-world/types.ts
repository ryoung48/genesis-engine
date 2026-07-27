import type { GenesisParams } from "@/model/pipelines/types"
import type {
	BoundaryInfo,
	DistanceFields,
	GenesisTerrainFeatures,
} from "@/model/tectonics/types"

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

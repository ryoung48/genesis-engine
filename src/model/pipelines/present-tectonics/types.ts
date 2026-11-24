import type { BeltRecords } from "@/model/geography/tectonics/belt-records/types"
import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type { PastRecord } from "@/model/geography/tectonics/crust-past/types"
import type { GeologicRecord } from "@/model/geography/tectonics/geologic-record/types"
import type { PlateFronts } from "@/model/geography/tectonics/plate-fronts/types"
import type { PlateMotion } from "@/model/geography/tectonics/plate-motion/types"
import type {
	SimMesh,
	SimSpace,
} from "@/model/geography/tectonics/sim-mesh/types"
import type {
	GenesisTerrainFeatures,
	PlateVec,
	SuperPlateData,
} from "@/model/geography/tectonics/types"
import type {
	SimFront,
	WorldSample,
} from "@/model/geography/tectonics/world-sample/types"
import type { ArcCrust } from "@/model/geography/terrain/arc-crust/types"
import type { PlumeRecord } from "@/model/geography/terrain/plumes/types"
import type {
	Edifice,
	StampResult,
	VolcanoSite,
} from "@/model/geography/terrain/volcano-edifices/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface PresentTectonics {
	simMesh: SimMesh
	sample: WorldSample
	motion: PlateMotion
	fronts: PlateFronts
	simFronts: SimFront[]
	space: SimSpace
	crust: CrustRaster
	belts: BeltRecords
	past: PastRecord
	record: GeologicRecord | null
	plumes: PlumeRecord
	sites: VolcanoSite[]
	edifices: Edifice[]
	volcano: VolcanoStamp | null
}

export interface StampVolcanoesParams {
	present: PresentTectonics
	mesh: SphereMesh
	planetRadiusKm: number
	seed: number
	elevation: Float32Array
	maxElevKm: number
	maxDepthKm: number
	terrainFeatures: GenesisTerrainFeatures | undefined
}

export type VolcanoStamp = StampResult & { lipKm: Float32Array }

export interface BuildPresentTectonicsParams {
	mesh: SphereMesh
	planetRadiusKm: number
	seed: number
	r_plate: Int32Array
	plateVec: Map<number, PlateVec>
	plateIsOcean: Set<number>
	plateDensity: Map<number, number>
	superPlateData: SuperPlateData | null
	featureMask: Uint32Array
	arc: ArcCrust
	seaAgeMyr: Float32Array
}

export interface MarkVolcanoFeaturesParams {
	present: PresentTectonics
	result: StampResult
	terrainFeatures: GenesisTerrainFeatures
}

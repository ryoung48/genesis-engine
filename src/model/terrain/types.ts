import type { SphereMesh } from "../types/mesh"
import type {
	BoundaryInfo,
	DistanceFields,
	GenesisParams,
	GenesisTerrainFeatures,
	TectonicPlate,
} from "../types/tectonics"
import type { GenesisClimate, GenesisHydrology, GenesisRainfall } from "../types/climate"

export interface BoundedBfsParams {
	dist: Float32Array
	seeds: number[]
	halfWidth: number
	adjOffset: Int32Array
	adjList: Int32Array
	canVisit: (nr: number, r: number) => boolean
}

export interface BuildGlacialBuffersParams {
	N: number
	r_xyz: Float32Array
	r_isOcean: Uint8Array
	elev: Float32Array
	glacialStrength: number
}

export interface SelectCompactLakeFallbackParams {
	numRegions: number
	adjOffset: Int32Array
	adjList: Int32Array
	elevation: Float32Array
	lakeCells: number[]
	targetCellCount: number
}

export interface TrimLakeCorridorsParams {
	numRegions: number
	adjOffset: Int32Array
	adjList: Int32Array
	elevation: Float32Array
	basinCells: number[]
	lakeCells: number[]
}

export interface SelectConnectedLakeCellsParams {
	numRegions: number
	adjOffset: Int32Array
	adjList: Int32Array
	elevation: Float32Array
	basinCells: number[]
	targetCellCount: number
}

export interface BuildTangentFrameParams {
	px: number
	py: number
	pz: number
	dx: number
	dy: number
	dz: number
}

export interface ComputeDistanceFieldsParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plateIsOcean: Set<number>
	boundary: BoundaryInfo
	seed: number
}

export interface WarpTerrainParams {
	mesh: SphereMesh
	elev: Float32Array
	seed: number
	strength: number
	r_hotspot?: Float32Array | null
}

export interface SmoothElevationParams {
	mesh: SphereMesh
	elev: Float32Array
	r_isOcean: Uint8Array
	iterations: number
	strength: number
}

export interface SharpenRidgesParams {
	mesh: SphereMesh
	elev: Float32Array
	r_isOcean: Uint8Array
	iterations: number
	strength: number
}

export interface ApplySoilCreepParams {
	mesh: SphereMesh
	elev: Float32Array
	r_isOcean: Uint8Array
	iterations: number
	strength: number
}

export interface PropagateInfluenceParams {
	mesh: SphereMesh
	seeds: number[]
	base: Float32Array
	decay: number
	minValue: number
}

export interface ComputeHazardsParams {
	mesh: SphereMesh
	boundary: BoundaryInfo
	distFields: DistanceFields
	elevationKm: Float32Array
	isLand: Uint8Array
	hotspot?: Float32Array
}

export interface ApplyHotspotsParams {
	mesh: SphereMesh
	plates: TectonicPlate[]
	plateAssignment: Int32Array
	elevation: Float32Array
	mantleUpwelling: Float32Array
	terrainFeatures: GenesisTerrainFeatures | undefined
	seed: number
	volcanism: number
}

export interface ComputeLakesParams {
	mesh: Pick<SphereMesh, "numRegions" | "adjOffset" | "adjList">
	elevation: Float32Array
	rainfall: Pick<GenesisRainfall, "annual">
	waterLevel: Float32Array
	basinId: Int32Array
	isLand: Uint8Array
	emergedLand?: Uint8Array
	elevationKm?: Float32Array
}

export interface ComputeProvincesParams {
	mesh: SphereMesh
	isLand: Uint8Array
	topography: Uint8Array
	seed: number
	options?: {
		climateZones?: Uint8Array
		rainfall?: GenesisRainfall
		oceanCoastal?: Uint8Array
		lakeCoastal?: Uint8Array
		riverVisible?: Uint8Array
		planetRadiusKm?: number
	}
}

export interface ComputeWeightedProvincesParams {
	mesh: SphereMesh
	isLand: Uint8Array
	_topography: Uint8Array
	seedRegions: Int32Array
	seedNames: string[]
	seed: number
	options?: {
		climateZones?: Uint8Array
		rainfall?: GenesisRainfall
		oceanCoastal?: Uint8Array
		lakeCoastal?: Uint8Array
		riverVisible?: Uint8Array
		planetRadiusKm?: number
	}
	seedWeights?: Float32Array
}

export interface ComputeProvincesFromRasterParams {
	mesh: SphereMesh
	isLand: Uint8Array
	regionIds: Int16Array
	seed: number
	options?: {
		climateZones?: Uint8Array
		rainfall?: GenesisRainfall
		oceanCoastal?: Uint8Array
		lakeCoastal?: Uint8Array
		riverVisible?: Uint8Array
		planetRadiusKm?: number
	}
	fallbackSeeds?: { id: number; lon: number; lat: number }[]
}

export interface ComputeRiversParams {
	mesh: SphereMesh
	elevation: Float32Array
	rainfall: GenesisRainfall
	climate: GenesisClimate
	hydrology: GenesisHydrology
	isLand: Uint8Array
	params?: Pick<GenesisParams, "planetRadiusKm" | "daysPerYear" | "hoursPerDay">
}

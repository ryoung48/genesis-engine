export type {
	OrogenClimate,
	OrogenHazards,
	OrogenHydrology,
	OrogenOceanCurrents,
	OrogenRainfall,
} from "./types/climate"
export type { SphereMesh } from "./types/mesh"
export type {
	OrogenLocations,
	OrogenNationHierarchy,
	OrogenPartition,
	OrogenProvinces,
	OrogenRivers,
} from "./types/society"
export { OROGEN_TOPOGRAPHY_LABELS } from "./types/society"

export type {
	BoundaryInfo,
	CollisionResult,
	DistanceFields,
	OrogenParams,
	OrogenTerrainFeatures,
	PlateVec,
	StageTiming,
	SuperPlateData,
	TectonicPlate,
} from "./types/tectonics"
export {
	OROGEN_TERRAIN_FEATURE,
	OROGEN_TERRAIN_FEATURE_LABELS,
} from "./types/tectonics"
export type { OrogenWorld } from "./world"

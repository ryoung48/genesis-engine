import type {
	OrogenClimate,
	OrogenHazards,
	OrogenHydrology,
	OrogenOceanCurrents,
	OrogenRainfall,
	OrogenVolcanism,
} from "./types/climate"
import type { SphereMesh } from "./types/mesh"
import type {
	OrogenNationHierarchy,
	OrogenPartition,
	OrogenProvinces,
	OrogenRivers,
} from "./types/society"
import type {
	BoundaryInfo,
	DistanceFields,
	OrogenParams,
	OrogenTerrainFeatures,
	StageTiming,
	TectonicPlate,
} from "./types/tectonics"

export interface OrogenWorld {
	mesh: SphereMesh
	plates: TectonicPlate[]
	plateAssignment: Int32Array
	boundary: BoundaryInfo
	distFields: DistanceFields
	elevation: Float32Array
	terrainFeatures?: OrogenTerrainFeatures
	/** Per-cell elevation in km (radius-scaled). Positive = land height, negative = ocean depth. */
	elevation_km: Float32Array
	params: OrogenParams
	timings?: StageTiming[]
	climate: OrogenClimate
	/** Distance from nearest ocean cell in km (land cells only, 0 for ocean) */
	oceanDist: Float32Array
	rainfall: OrogenRainfall
	hazards: OrogenHazards
	volcanism: OrogenVolcanism
	/** Per-cell climate zone code (0=ocean, 1=arctic, 2=subarctic, 3=boreal, 4=temperate, 5=subtropical, 6=tropical, 7=infernal, 8=chaotic) */
	climateZones: Uint8Array
	/** Per-cell pasta climate code (0=fallback/ocean, 1+=PASTA_LABELS order) */
	pastaClimate: Uint8Array
	/** Per-cell pasta climate detail metrics used by hover charts */
	pastaDebug?: import("./climate/pasta").PastaDebug
	/** Per-cell ice thickness in mm water equivalent (0 for ice-free) */
	iceThickness: Float32Array
	/** Per-cell minimum ice across final-year months (mm w.e.) — for sea ice classification */
	iceMinMonthly: Float32Array
	/** Per-cell maximum ice across final-year months (mm w.e.) — for sea ice classification */
	iceMaxMonthly: Float32Array
	/** Per-cell Koppen climate code (index into KOPPEN_CLASSES) */
	koppenClimate: Uint8Array
	/** Ocean current warmth (ocean cells) and diffused coastal warmth (land cells) */
	oceanCurrents?: OrogenOceanCurrents
	/** Per-cell biome code (0=ocean, 1=desert, 2=sparse, 3=grasslands, 4=woods, 5=forest, 6=jungle) */
	vegetation: Uint8Array
	/** Per-cell topography code, index into OROGEN_TOPOGRAPHY_LABELS */
	topography: Uint8Array
	/** Per-cell coastal flag (1 = borders ocean or lake, 0 = otherwise). */
	coastal: Uint8Array
	/** Per-cell normalized local slope/ruggedness score (0..1, p95-normalized). */
	slopeScore: Float32Array
	rivers: OrogenRivers
	dtr_annual: Float32Array
	dtr_monthly: Float32Array
	hydrology: OrogenHydrology
	isLand: Uint8Array
	riverLand: Uint8Array
	provinces?: OrogenProvinces
	nations?: OrogenNationHierarchy
	cultures?: OrogenPartition
	heritages?: OrogenPartition
	faiths?: OrogenPartition
	religions?: OrogenPartition
	landmarks?: import("./terrain/landmarks").OrogenLandmarks
	population?: import("./society/population").ProvincePopulation
	continentCount: number
	/** Pre-computed monthly thermal equator latitude (deg) per longitude bin, 12 months */
	monthlyTEQ?: Float32Array[]
}

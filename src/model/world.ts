import type { LocationTradeGoods } from "./economy/trade-goods"
import type { GenesisLandmarks } from "./terrain/landmarks"
import type {
	GenesisClimate,
	GenesisHazards,
	GenesisHydrology,
	GenesisOceanCurrents,
	GenesisRainfall,
	GenesisVolcanism,
} from "./types/climate"
import type { SphereMesh } from "./types/mesh"
import type {
	GenesisLocations,
	GenesisNationHierarchy,
	GenesisPartition,
	GenesisProvinces,
	GenesisRivers,
} from "./types/society"
import type {
	BoundaryInfo,
	DistanceFields,
	GenesisParams,
	GenesisTerrainFeatures,
	StageTiming,
	TectonicPlate,
} from "./types/tectonics"

export interface GenesisWorld {
	mesh: SphereMesh
	plates: TectonicPlate[]
	plateAssignment: Int32Array
	boundary: BoundaryInfo
	distFields: DistanceFields
	elevation: Float32Array
	terrainFeatures?: GenesisTerrainFeatures
	/** Per-cell elevation in km (radius-scaled). Positive = land height, negative = ocean depth. */
	elevation_km: Float32Array
	params: GenesisParams
	timings?: StageTiming[]
	climate: GenesisClimate
	/** Distance from nearest ocean cell in km (land cells only, 0 for ocean) */
	oceanDist: Float32Array
	rainfall: GenesisRainfall
	hazards: GenesisHazards
	volcanism: GenesisVolcanism
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
	oceanCurrents?: GenesisOceanCurrents
	/** Per-cell cyclone risk score in [0, 1]. */
	cycloneRisk?: Float32Array
	/** Per-cell tornado risk score in [0, 1]. */
	tornadoRisk?: Float32Array
	/** Per-cell modeled tidal range in meters. */
	tidalRange?: Float32Array
	/** Tidal schedule with events. */
	tidalSchedule?: import("./climate/tidal-schedule").TidalSchedule
	/** Per-cell biome code (0=ocean, 1=desert, 2=sparse, 3=grasslands, 4=woods, 5=forest, 6=jungle) */
	vegetation: Uint8Array
	/** Per-cell topography code, index into GENESIS_TOPOGRAPHY_LABELS */
	topography: Uint8Array
	/** Per-cell coastal flag (1 = borders ocean or lake, 0 = otherwise). */
	coastal: Uint8Array
	/** Per-province water access level (0=none, 1=river/lake, 2=ocean). */
	waterAccess?: Uint8Array
	/** Per-province flag: has at least one visible river cell. */
	riverAccess?: Uint8Array
	/** Per-province flag: adjacent to a lake. */
	lakeAccess?: Uint8Array
	/** Per-cell normalized local slope/ruggedness score (0..1, p95-normalized). */
	slopeScore: Float32Array
	rivers: GenesisRivers
	dtr_annual: Float32Array
	dtr_monthly: Float32Array
	hydrology: GenesisHydrology
	isLand: Uint8Array
	riverLand: Uint8Array
	provinces?: GenesisProvinces
	locations?: GenesisLocations
	nations?: GenesisNationHierarchy
	cultures?: GenesisPartition
	heritages?: GenesisPartition
	religions?: GenesisPartition
	religionTypes?: Uint8Array
	landmarks?: GenesisLandmarks
	population?: import("./society/population").ProvincePopulation
	tradeGoods?: LocationTradeGoods
	settlementRegions?: Int32Array
	settlementWaterLandmarks?: Int32Array
	settlementPortRegions?: Int32Array
	continentCount: number
	/** Pre-computed monthly thermal equator latitude (deg) per longitude bin, 12 months */
	monthlyTEQ?: Float32Array[]
}

import type { TideLock } from "@/model/celestial/orbit-body/types"
import type {
	GenesisObservedCurrent,
	GenesisObservedDtr,
	GenesisObservedHumidity,
	GenesisObservedWind,
} from "@/model/climate/observed-earth/types"
import type { PastaDebug } from "@/model/climate/pasta/types"
import type { TidalSchedule } from "@/model/climate/tidal-schedule/types"
import type {
	GenesisClimate,
	GenesisHydrology,
	GenesisOceanCurrents,
	GenesisRainfall,
} from "@/model/climate/types"
import type {
	BoundaryInfo,
	DistanceFields,
	GenesisTerrainFeatures,
	TectonicPlate,
} from "@/model/geography/tectonics/types"
import type { GenesisHazards } from "@/model/geography/terrain/hazards/types"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { GenesisLocations } from "@/model/geography/terrain/locations/types"
import type { GenesisRivers } from "@/model/geography/terrain/rivers/types"
import type { GenesisVolcanism } from "@/model/geography/terrain/volcanism/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { LocationTradeGoods } from "@/model/society/infrastructure/trade/trade-goods/types"
import type {
	Route,
	RouteEdge,
} from "@/model/society/infrastructure/transport/types"
import type { ProvincePopulation } from "@/model/society/population/types"
import type {
	GenesisNationHierarchy,
	GenesisPartition,
	GenesisProvinces,
	SocietyEra,
} from "@/model/society/types"

export interface GenesisParams {
	seed: number
	numPoints: number
	numPlates: number
	landDistribution: number
	continentSizeVariety: number
	landCoverage: number
	jitter: number
	roughness: number
	terrainWarp: number
	smoothing: number
	hydraulicErosion: number
	thermalErosion: number
	ridgeSharpening: number
	glacialErosion: number
	seaLevel: number
	volcanism?: number
	craters?: number // 0 = none, 1 = heavily cratered
	maxElevation?: number // max elevation in meters, default 6000
	planetRadiusKm: number
	obliquity: number // axial tilt in degrees, default 23.5
	eccentricity: number // orbital eccentricity, default 0.0167
	spectralClass: string // stellar spectral class, default "G"
	starSubtype: number // spectral subtype 0–9, default 2.0 (G2 ≈ Sol)
	orbitalDistanceAU: number // orbital semi-major axis in AU, default 1.0
	daysPerYear: number // orbital year length in local days, default 365
	hoursPerDay: number // rotation period expressed as local hours per day, default 24
	pastaGintThreshold: number // GInt needed for a zero-GDD period to interrupt accumulation, default 1250
	tideLock: TideLock | null // null = not locked
	substellarLon: number // longitude of the substellar point in degrees (0-360), default 0
	perihelion: number // argument of perihelion in degrees (0-360), default 90
	pressure?: number // atmospheric pressure in bars, default 1.0
	/** Real per-body Bond albedo override (0..1) -- pass this for a known real
	 * body (e.g. Sol's Earth, see sol-system.ts's SolPlanetSeed.albedo doc);
	 * leave unset for a procedurally generated world, which falls back to
	 * EMB_CONSTANTS.surface.ALBEDO.BASE. */
	albedo?: number
	/** Real per-body EBM greenhouseFactor override -- pass this alongside
	 * albedo for a known real body (see ebm/index.ts's EBMConfig.
	 * greenhouseFactor doc for what it means and how it's fit); leave unset
	 * for a procedurally generated world, which falls back to
	 * EMB_CONSTANTS.surface.GREENHOUSE_FACTOR. */
	greenhouseFactor?: number
	/** Geologic/tidal heating (system-seismology.ts's SeismologyProfile.
	 * totalHeating), applied on top of the EBM's own solved equilibrium --
	 * see ebm/index.ts's EBMConfig.seismologyTotalHeatingK doc. 0/unset for
	 * the overwhelming majority of bodies; only matters for a geologically or
	 * tidally active world/moon (e.g. an Io-analog). Never pass this for a
	 * jovian -- see that doc's explanation of why it breaks their
	 * temperature calibration. */
	seismologyTotalHeatingK?: number
	/** Seed for the sibling/system bodies shown in the Generation panel; 0 = Sol. Not used by terrain generation. */
	restSeed?: number
	/** Society era preset; controls population, settlement coverage, and nation-formation thresholds */
	era?: SocietyEra
}

export interface StageTiming {
	Stage: string
	ms: string
}

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
	/** True when this world came from the "Load Earth" heightmap-import pipeline, not procedural generation. */
	isEarthImport?: boolean
	timings?: StageTiming[]
	climate: GenesisClimate
	/** [JUSTIFICATION] Present only for Earth imports with an observed cloud-cover raster. */
	observedCloudCover?: {
		real_monthly: Float32Array
		real_annual: Float32Array
	}
	/** Distance from nearest ocean cell in km (land cells only, 0 for ocean) */
	oceanDist: Float32Array
	rainfall: GenesisRainfall
	hazards: GenesisHazards
	volcanism: GenesisVolcanism
	/** Per-cell climate zone code (0=ocean, 1=arctic, 2=subarctic, 3=boreal, 4=temperate, 5=subtropical, 6=tropical, 7=infernal, 8=chaotic) */
	climateZones: Uint8Array
	/** Per-cell climate zone code classified from observed-Earth temperature instead of the procedural model. Earth-import only. */
	realClimateZones?: Uint8Array
	/** Per-cell pasta climate code (0=fallback/ocean, 1+=PASTA_LABELS order) */
	pastaClimate: Uint8Array
	/** Per-cell pasta climate detail metrics used by hover charts */
	pastaDebug?: PastaDebug
	/** Per-cell ice thickness in mm water equivalent (0 for ice-free) */
	iceThickness: Float32Array
	/** Per-cell minimum ice across final-year months (mm w.e.) — for sea ice classification */
	iceMinMonthly: Float32Array
	/** Per-cell maximum ice across final-year months (mm w.e.) — for sea ice classification */
	iceMaxMonthly: Float32Array
	/** Per-cell Koppen climate code (index into KOPPEN_CLASSES) */
	koppenClimate: Uint8Array
	/** Per-cell Koppen climate code classified from observed-Earth temp/rain instead of the procedural model. Earth-import only. */
	realKoppenClimate?: Uint8Array
	/** Per-cell pasta climate code classified from observed-Earth temp/rain (PET/AET approximated via Thornthwaite/bucket model). Earth-import only. */
	realPastaClimate?: Uint8Array
	/** Ocean current warmth (ocean cells) and diffused coastal warmth (land cells) */
	oceanCurrents?: GenesisOceanCurrents
	/** Per-cell cyclone risk score in [0, 1]. */
	cycloneRisk?: Float32Array
	/** Per-cell tornado risk score in [0, 1]. */
	tornadoRisk?: Float32Array
	/** Per-cell modeled tidal range in meters. */
	tidalRange?: Float32Array
	/** Tidal schedule with events. */
	tidalSchedule?: TidalSchedule
	/** Per-cell biome code (0=ocean, 1=desert, 2=sparse, 3=grasslands, 4=woods, 5=forest, 6=jungle) */
	vegetation: Uint8Array
	/** [JUSTIFICATION] Present only for Earth imports, where it is classified from observed climate data. */
	realVegetation?: Uint8Array
	/** Per-cell topography code, index into GENESIS_TOPOGRAPHY_LABELS */
	topography: Uint8Array
	/** Per-cell EU5 (Project Caesar) location topography code, -1 if unmapped. Index into EU5_TOPOGRAPHY_CATEGORIES in src/ui/planet/colors.ts. Earth-import only. */
	eu5Topography?: Int16Array
	/** Per-cell EU5 location vegetation code, -1 if unmapped. Index into EU5_VEGETATION_CATEGORIES. Earth-import only. */
	eu5Vegetation?: Int16Array
	/** Per-cell EU5 location climate code, -1 if unmapped. Index into EU5_CLIMATE_CATEGORIES. Earth-import only. */
	eu5Climate?: Int16Array
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
	observedDtr?: GenesisObservedDtr
	observedHumidity?: GenesisObservedHumidity
	observedWind?: GenesisObservedWind
	observedCurrent?: GenesisObservedCurrent
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
	population?: ProvincePopulation
	tradeGoods?: LocationTradeGoods
	settlementRegions?: Int32Array
	settlementWaterLandmarks?: Int32Array
	settlementPortRegions?: Int32Array
	/** Per-province urban population from the urbanization stage. */
	urbanPopulation?: Float32Array
	/** Per-province development in [0, 1] from the urbanization stage. */
	development?: Float32Array
	/** Trade and road routes between settlements. */
	routes?: Route[]
	/** Deduplicated route network edges, for rendering and pathfinding. */
	network?: RouteEdge[]
	continentCount: number
	/** Pre-computed monthly thermal equator latitude (deg) per longitude bin, 12 months */
	monthlyTEQ?: Float32Array[]
}

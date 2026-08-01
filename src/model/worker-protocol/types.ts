import type { TideLock } from "@/model/celestial/orbit-body/types"
import type { TidalSchedule } from "@/model/climate/tidal-schedule/types"
import type { GenesisLocations } from "@/model/geography/terrain/locations/types"
import type { HistoryNote } from "@/model/history/generated/state/types"
import type { GenesisParams, StageTiming } from "@/model/pipelines/types"
import type { SerializedRoutes } from "@/model/society/infrastructure/transport/types"
import type {
	GenesisNationHierarchy,
	GenesisPartition,
	GenesisProvinces,
} from "@/model/society/types"

interface SerializedSphereMesh {
	numRegions: number
	numTriangles: number
	numSides: number
	r_xyz: Float32Array
	t_xyz: Float32Array
	triangles: Int32Array
	halfedges: Int32Array
	adjOffset: Int32Array
	adjList: Int32Array
	neighborDist: Float32Array
	s_begin_r: Int32Array
	s_end_r: Int32Array
	s_inner_t: Int32Array
	s_outer_t: Int32Array
}

interface SerializedGenesisClimate {
	temperature_avg: Float32Array
	temperature_min: Float32Array
	temperature_max: Float32Array
	temperature_monthly: Float32Array
	real_temperature_avg?: Float32Array
	real_temperature_monthly?: Float32Array
	temperature_diff_avg?: Float32Array
	temperature_diff_monthly?: Float32Array
	temperature_monthly_nolapse: Float32Array
	temperature_monthly_range: Float32Array
	insolation_monthly: Float32Array
	pet_monthly: Float32Array
	daylight_hours_monthly: Float32Array
	landFraction: number[]
}

type SerializedPartition = GenesisPartition

type SerializedProvinces = GenesisProvinces

type SerializedLocations = GenesisLocations

type SerializedNationHierarchy = GenesisNationHierarchy

export interface SerializedGenesisWorld {
	mesh: SerializedSphereMesh
	plateAssignment: Int32Array
	elevation: Float32Array
	terrainFeatures?: {
		featureMask: Uint32Array
		dominantFeature: Uint8Array
	}
	elevation_km: Float32Array
	params: GenesisParams
	isEarthImport?: boolean
	timings?: StageTiming[]
	continentCount: number
	climate: SerializedGenesisClimate
	oceanDist: Float32Array
	distCoast?: Float32Array
	rainfall: {
		monthly: Float32Array
		annual: Float32Array
		real_monthly?: Float32Array
		real_annual?: Float32Array
		diff_monthly?: Float32Array
		diff_annual?: Float32Array
		east: Float32Array
		west: Float32Array
	}
	cycloneRisk?: Float32Array
	tornadoRisk?: Float32Array
	tidalRange?: Float32Array
	tidalSchedule?: TidalSchedule
	hazards: {
		earthquake: Float32Array
		volcano: Float32Array
		danger: Float32Array
	}
	volcanism: {
		hotspot: Float32Array
		mantleUpwelling: Float32Array
		hotspotExposure?: {
			threshold: number
			activeCells: number
			aboveWaterBeforeFlood: number
			aboveWaterAfterFlood: number
		}
	}
	climateZones: Uint8Array
	/** [JUSTIFICATION] Present only for Earth imports, where zones are classified from observed temperatures. */
	realClimateZones?: Uint8Array
	pastaClimate: Uint8Array
	pastaDebug?: {
		gdd: Float32Array
		gint: Float32Array
		gdd_monthly: Float32Array
		gint_monthly: Float32Array
		minT: Float32Array
		maxT: Float32Array
	}
	hydrology: {
		aet_monthly: Float32Array
	}
	iceThickness: Float32Array
	iceMinMonthly: Float32Array
	iceMaxMonthly: Float32Array
	koppenClimate: Uint8Array
	realKoppenClimate?: Uint8Array
	realPastaClimate?: Uint8Array
	vegetation: Uint8Array
	/** [JUSTIFICATION] Present only for Earth imports, where it is classified from observed climate data. */
	realVegetation?: Uint8Array
	topography: Uint8Array
	eu5Topography?: Int16Array
	eu5Vegetation?: Int16Array
	eu5Climate?: Int16Array
	coastal: Uint8Array
	waterAccess?: Uint8Array
	riverAccess?: Uint8Array
	lakeAccess?: Uint8Array
	slopeScore: Float32Array
	isLand: Uint8Array
	riverLand: Uint8Array
	dtr_annual: Float32Array
	dtr_monthly: Float32Array
	observedDtr?: {
		real_monthly?: Float32Array
		real_annual?: Float32Array
		diff_monthly?: Float32Array
		diff_annual?: Float32Array
	}
	observedHumidity?: {
		real_monthly?: Float32Array
		real_annual?: Float32Array
	}
	observedWind?: {
		real_u_monthly?: Float32Array
		real_v_monthly?: Float32Array
		real_speed_monthly?: Float32Array
	}
	observedCurrent?: {
		real_u_monthly?: Float32Array
		real_v_monthly?: Float32Array
		real_speed_monthly?: Float32Array
		real_sst_anomaly_monthly?: Float32Array
	}
	rivers: {
		lines: [number, number, number, number][][]
		maxFlow: number
		minFlow: number
		flow: Float32Array
		flow_monthly: Float32Array
		riverId: Int32Array
		riverLengthKm: Float32Array
		riverNames?: (string | null)[]
		visible: Uint8Array
		basinId: Int32Array
		waterLevel: Float32Array
	}
	oceanCurrents?: {
		oceanWarmth: Float32Array
		coastalWarmth: Float32Array
		oceanWarmthMonthly?: Float32Array
		coastalWarmthMonthly?: Float32Array
		temperatureDeltaMonthly?: Float32Array
		temperatureDelta: Float32Array
	}
	provinces?: SerializedProvinces
	locations?: SerializedLocations
	nations?: SerializedNationHierarchy
	leaderDynasty?: Int32Array
	leaderNameSeed?: Int32Array
	leaderClaim?: Int32Array
	leaderBirthYear?: Float32Array
	cultures?: SerializedPartition
	heritages?: SerializedPartition
	religions?: SerializedPartition
	religionTypes?: Uint8Array
	landmarks?: {
		regionLandmark: Int32Array
		type: Uint8Array
		size: Int32Array
		dominantCulture?: Int32Array
		nameSeeds?: Int32Array
		realNames?: (string | null)[]
		count: number
	}
	development?: Float32Array
	urbanPopulation?: Float32Array
	population?: {
		habitability: Float32Array
		population: Float32Array
		habitabilityScore: number
		totalPopulation: number
		migrationWave?: Float32Array
		cradleProvinces?: Int32Array
		settlementWave?: number
	}
	realPopulation?: {
		population: Float32Array
		difference: Float32Array
		totalPopulation: number
		sourceTimeDays: number
		sourceTimeLabel: string
	}
	realUrbanPopulation?: {
		population: Float32Array
		totalPopulation: number
		sourceTimeDays: number
		sourceTimeLabel: string
	}
	/** Per compact province index: the largest real GHSL settlement in that
	 * province at the current date, if any (see
	 * scripts/build-ghsl-settlements.py, GenesisView.tsx's
	 * buildBestSettlementByProvince). null/0 where there isn't one. */
	realSettlement?: {
		names: (string | null)[]
		population: Float32Array
	}
	monthlyTEQ?: Float32Array[]
	/** Per-location trade good index (0=unassigned, 1-based into TRADE_GOOD_LABELS). */
	tradeGoods?: Uint8Array
	settlementRegions?: Int32Array
	settlementWaterLandmarks?: Int32Array
	settlementPortRegions?: Int32Array
	routes?: SerializedRoutes
	network?: SerializedNetwork
	/** Terrain/map geometry for the default display state (colorMode
	 * "terrain", no region colors, elevation on, map centered at lon/lat 0),
	 * computed once in genesis.worker.ts so the main thread doesn't have to
	 * run that per-vertex color/normal-averaging pass synchronously right
	 * before the first paint after "Generate"/"Load Earth" -- see
	 * mesh-builders.ts's buildTerrainMesh/buildMapMesh. Any other display
	 * state (a non-default color mode, region colors, a panned map) is
	 * computed on the main thread as before. */
	precomputedTerrainGeometry?: {
		positions: Float32Array
		normals: Float32Array
		colors: Float32Array
		faceToRegion: Int32Array
	}
	precomputedMapGeometry?: {
		positions: Float32Array
		colors: Float32Array
		lonLat: Float32Array
		faceToRegion: Int32Array
	}
}

export interface SerializedHistoryFrame {
	timeMs: number
	assignment: Int32Array
	parent: Int32Array
	sovereign: Int32Array
	leaderDynasty: Int32Array
	leaderNameSeed: Int32Array
	leaderClaim: Int32Array
	leaderBirthYear: Float32Array
	colors: Float32Array
	populationTotal: Float32Array
	populationUrban: Float32Array
	development: Float32Array
	consumption: Float32Array
	nationWealth: Float32Array
	nationOptimalWealth: Float32Array
	relationA: Int32Array
	relationB: Int32Array
	relationValues: Uint8Array
	activeWars: Array<{
		idx: number
		attacker: number
		defender: number
		rebel: boolean
		occupied: number[]
	}>
	sovereignCount: number
	totalPopulation: number
	/** Per-province secondary (bleeding) culture index. -1 = no blend. */
	cultureBlendSecondary: Int32Array
	/** Per-province blend weight [0, 1]. 0 = pure primary culture. */
	cultureBlendWeight: Float32Array
}

export interface SerializedNetwork {
	fromRegion: Int32Array
	toRegion: Int32Array
	kind: Uint8Array
	usage: Int32Array
	weight: Float32Array
}

export type GenesisWorkerRequest =
	| {
			type: "generate"
			params: GenesisParams
	  }
	| {
			type: "import"
			params: {
				seed: number
				numPoints: number
				jitter: number
				grayscale: Uint8Array
				imageWidth: number
				imageHeight: number
				coastlineMask?: Uint8Array
				maskWidth?: number
				maskHeight?: number
				coastDensityBoost?: number
				lakeMask?: Uint8Array
				lakeMaskWidth?: number
				lakeMaskHeight?: number
				riverLines?: { points: number[]; strokeweig: number }[]
				lakeNames?: { name: string; ring: [number, number][] }[]
				realProvinces?: {
					name: string
					lon: number
					lat: number
					weight: number
				}[]
				realClimateMonthly?: Int16Array
				realClimateWidth?: number
				realClimateHeight?: number
				realClimateMonths?: number
				realClimateScale?: number
				realClimateNoData?: number
				realPrecipMonthly?: Int16Array
				realPrecipWidth?: number
				realPrecipHeight?: number
				realPrecipMonths?: number
				realPrecipScale?: number
				realPrecipNoData?: number
				realDtrMonthly?: Int16Array
				realDtrWidth?: number
				realDtrHeight?: number
				realDtrMonths?: number
				realDtrScale?: number
				realDtrNoData?: number
				realVaporPressureMonthly?: Int16Array
				realVaporPressureWidth?: number
				realVaporPressureHeight?: number
				realVaporPressureMonths?: number
				realVaporPressureScale?: number
				realVaporPressureNoData?: number
				realWindUMonthly?: Int16Array
				realWindVMonthly?: Int16Array
				realWindWidth?: number
				realWindHeight?: number
				realWindMonths?: number
				realWindScale?: number
				realWindNoData?: number
				realCurrentUMonthly?: Int16Array
				realCurrentVMonthly?: Int16Array
				realCurrentWidth?: number
				realCurrentHeight?: number
				realCurrentMonths?: number
				realCurrentScale?: number
				realCurrentNoData?: number
				realSstAnomalyMonthly?: Int16Array
				realSstAnomalyWidth?: number
				realSstAnomalyHeight?: number
				realSstAnomalyMonths?: number
				realSstAnomalyScale?: number
				realSstAnomalyNoData?: number
				realElevationRaster?: Int16Array
				realElevationWidth?: number
				realElevationHeight?: number
				realElevationScale?: number
				realElevationNoData?: number
				eu5TopographyRaster?: Int16Array
				eu5TopographyWidth?: number
				eu5TopographyHeight?: number
				eu5TopographyNoData?: number
				eu5VegetationRaster?: Int16Array
				eu5VegetationWidth?: number
				eu5VegetationHeight?: number
				eu5VegetationNoData?: number
				eu5ClimateRaster?: Int16Array
				eu5ClimateWidth?: number
				eu5ClimateHeight?: number
				eu5ClimateNoData?: number
				eu4ProvincesRaster?: Int16Array
				eu4ProvincesWidth?: number
				eu4ProvincesHeight?: number
				eu4ProvincesNoData?: number
				eu4ProvinceFallbackSeeds?: { id: number; lon: number; lat: number }[]
				terrainWarp: number
				smoothing: number
				hydraulicErosion: number
				thermalErosion: number
				ridgeSharpening: number
				glacialErosion: number
				seaLevel: number
				volcanism?: number
				craters?: number
				maxElevation?: number
				planetRadiusKm?: number
				obliquity?: number
				eccentricity?: number
				spectralClass?: string
				starSubtype?: number
				orbitalDistanceAU?: number
				daysPerYear?: number
				hoursPerDay?: number
				tideLock?: TideLock | null
				substellarLon?: number
				perihelion?: number
				pressure?: number
				albedo?: number
				greenhouseFactor?: number
				seismologyTotalHeatingK?: number
			}
	  }
	| {
			type: "pathfind"
			startRegion: number
			endRegion: number
			allowLand: boolean
			allowSea: boolean
			network?: SerializedNetwork | null
	  }
	| {
			type: "simulate"
			tickMs?: number
	  }
	| {
			type: "pause"
	  }

export type GenesisWorkerResponse =
	| {
			type: "progress"
			label: string
			pct?: number
	  }
	| {
			type: "done"
			world: SerializedGenesisWorld
			frame?: SerializedHistoryFrame
	  }
	| {
			type: "error"
			message: string
			stack?: string
	  }
	| {
			type: "pathfind-result"
			pathRegions: Int32Array
			distanceKm: number
			landKm: number
			seaKm: number
			travelDays: number
			reachable: boolean
	  }
	| {
			type: "sim-progress"
			timeMs: number
			frame: SerializedHistoryFrame
			/** Events pushed to HistoryState.events since the previous
			 * "sim-progress" (or since init, for the first tick) -- lets the
			 * main thread accumulate a running event log without resending the
			 * whole history each tick. */
			newEvents: HistoryNote[]
	  }

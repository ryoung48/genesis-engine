import type {
	OrogenNationHierarchy,
	OrogenParams,
	OrogenPartition,
	OrogenProvinces,
	StageTiming,
} from ".."
import type { HistoryNote } from "../history"

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

interface SerializedOrogenClimate {
	temperature_avg: Float32Array
	temperature_min: Float32Array
	temperature_max: Float32Array
	temperature_monthly: Float32Array
	temperature_monthly_nolapse: Float32Array
	temperature_monthly_range: Float32Array
	insolation_monthly: Float32Array
	pet_monthly: Float32Array
	daylight_hours_monthly: Float32Array
	landFraction: number[]
}

type SerializedPartition = OrogenPartition
type SerializedProvinces = OrogenProvinces
type SerializedNationHierarchy = OrogenNationHierarchy

export interface SerializedOrogenWorld {
	mesh: SerializedSphereMesh
	plateAssignment: Int32Array
	elevation: Float32Array
	terrainFeatures?: {
		featureMask: Uint32Array
		dominantFeature: Uint8Array
	}
	elevation_km: Float32Array
	params: OrogenParams
	timings?: StageTiming[]
	continentCount: number
	climate: SerializedOrogenClimate
	oceanDist: Float32Array
	distCoast?: Float32Array
	rainfall: {
		monthly: Float32Array
		annual: Float32Array
		east: Float32Array
		west: Float32Array
	}
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
	vegetation: Uint8Array
	topography: Uint8Array
	coastal: Uint8Array
	slopeScore: Float32Array
	isLand: Uint8Array
	riverLand: Uint8Array
	dtr_annual: Float32Array
	dtr_monthly: Float32Array
	rivers: {
		lines: [number, number, number, number][][]
		maxFlow: number
		minFlow: number
		flow: Float32Array
		flow_monthly: Float32Array
		riverId: Int32Array
		riverLengthKm: Float32Array
		visible: Uint8Array
		lakes: Uint8Array
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
	nations?: SerializedNationHierarchy
	leaderDynasty?: Int32Array
	leaderNameSeed?: Int32Array
	leaderClaim?: Int32Array
	leaderBirthYear?: Float32Array
	cultures?: SerializedPartition
	heritages?: SerializedPartition
	faiths?: SerializedPartition
	religions?: SerializedPartition
	landmarks?: {
		regionLandmark: Int32Array
		type: Uint8Array
		size: Int32Array
		dominantCulture?: Int32Array
		nameSeeds?: Int32Array
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
	}
	monthlyTEQ?: Float32Array[]
}

export interface SerializedProvinceTimelineInt {
	times: Float64Array
	values: Int32Array
	offsets: Int32Array
}

export interface SerializedProvinceTimelineFloat {
	times: Float64Array
	values: Float32Array
	offsets: Int32Array
}

interface SerializedRelationTimelines {
	aIdx: Int32Array
	bIdx: Int32Array
	offsets: Int32Array
	times: Float64Array
	values: Int32Array
}

export interface SerializedTimelines {
	P: number
	startTimeMs: number
	endTimeMs: number
	parent: SerializedProvinceTimelineInt
	assignment: SerializedProvinceTimelineInt
	populationRural: SerializedProvinceTimelineFloat
	populationUrban: SerializedProvinceTimelineFloat
	development: SerializedProvinceTimelineFloat
	consumption: SerializedProvinceTimelineFloat
	leaderDynasty: SerializedProvinceTimelineInt
	leaderNameSeed?: SerializedProvinceTimelineInt
	leaderClaim: SerializedProvinceTimelineInt
	leaderBirthYear?: SerializedProvinceTimelineFloat
	occupation: SerializedProvinceTimelineInt
	relations: SerializedRelationTimelines
	nationColorKeys: Int32Array
	nationColorValues: Float32Array
	wars: Array<{
		idx: number
		attacker: number
		defender: number
		startTime: number
		endTime?: number
		rebel: boolean
	}>
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
}

export type OrogenWorkerRequest =
	| {
			type: "generate"
			params: OrogenParams
	  }
	| {
			type: "simulate"
			tickMs?: number
	  }
	| {
			type: "pause"
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
				terrainWarp: number
				smoothing: number
				hydraulicErosion: number
				thermalErosion: number
				ridgeSharpening: number
				glacialErosion: number
				volcanism?: number
				craters?: number
				planetRadiusKm?: number
				obliquity?: number
				eccentricity?: number
				sunTempFactor?: number
				daysPerYear?: number
				hoursPerDay?: number
				tidallyLocked?: boolean
				antistellarLon?: number
				perihelion?: number
				pressure?: number
			}
	  }

export type OrogenWorkerResponse =
	| {
			type: "progress"
			label: string
			pct?: number
	  }
	| {
			type: "done"
			world: SerializedOrogenWorld
			frame?: SerializedHistoryFrame
	  }
	| {
			type: "error"
			message: string
			stack?: string
	  }
	| {
			type: "sim-progress"
			timeMs: number
			frame: SerializedHistoryFrame
	  }
	| {
			type: "sim-done"
			timeMs: number
			timelines: SerializedTimelines
			events: HistoryNote[]
	  }

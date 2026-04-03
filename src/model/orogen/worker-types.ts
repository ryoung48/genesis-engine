import type { OrogenParams } from "./types"

export interface SerializedSphereMesh {
	numRegions: number
	numTriangles: number
	numSides: number
	r_xyz: Float32Array
	t_xyz: Float32Array
	halfedges: Int32Array
	s_begin_r: Int32Array
	s_end_r: Int32Array
	s_inner_t: Int32Array
	s_outer_t: Int32Array
}

export interface SerializedOrogenClimate {
	temperature_avg: Float32Array
	temperature_min: Float32Array
	temperature_max: Float32Array
	temperature_monthly: Float32Array
	pet_monthly: Float32Array
	daylight_hours_monthly?: Float32Array
	landFraction: number[]
}

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
	continentCount?: number
	climate?: SerializedOrogenClimate
	oceanDist?: Float32Array
	distCoast?: Float32Array
	rainfall?: { monthly: Float32Array; annual: Float32Array; east: Float32Array; west: Float32Array }
	hazards?: { earthquake: Float32Array; volcano: Float32Array; danger: Float32Array }
	volcanism?: { hotspot: Float32Array }
	climateZones?: Uint8Array
	pastaClimate?: Uint8Array
	pastaDebug?: {
		gdd: Float32Array
		gddz: Float32Array
		gint: Float32Array
		ar: Float32Array
		gar: Float32Array
		grs: Float32Array
		evr: Float32Array
		minT: Float32Array
		maxT: Float32Array
	}
	iceThickness?: Float32Array
	iceMinMonthly?: Float32Array
	iceMaxMonthly?: Float32Array
	koppenClimate?: Uint8Array
	vegetation?: Uint8Array
	topography?: Uint8Array
	slopeScore?: Float32Array
	isLand?: Uint8Array
	riverLand?: Uint8Array
	rivers?: { lines: [number, number, number, number][][]; maxFlow: number; minFlow: number; flow: Float32Array; flow_monthly: Float32Array; riverId: Int32Array; riverLengthKm: Float32Array; visible: Uint8Array; lakes: Uint8Array; basinId: Int32Array; waterLevel: Float32Array }
	oceanCurrents?: { oceanWarmth: Float32Array; coastalWarmth: Float32Array }
	wind?: {
		wind_east_monthly: Float32Array
		wind_north_monthly: Float32Array
		wind_speed_monthly: Float32Array
	}
	provinces?: {
		regionProvince: Int32Array
		seeds: Int32Array
		count: number
		desolate: Uint8Array
		adjOffset: Int32Array
		adjList: Int32Array
		size: Int32Array
		colors: Float32Array
	}
	nations?: {
		assignment: Int32Array
		seeds: Int32Array
		count: number
		adjOffset: Int32Array
		adjList: Int32Array
		size: Int32Array
		colors: Float32Array
	}
	cultures?: {
		assignment: Int32Array
		seeds: Int32Array
		count: number
		adjOffset: Int32Array
		adjList: Int32Array
		size: Int32Array
		colors: Float32Array
	}
	heritages?: {
		assignment: Int32Array
		seeds: Int32Array
		count: number
		adjOffset: Int32Array
		adjList: Int32Array
		size: Int32Array
		colors: Float32Array
	}
	faiths?: {
		assignment: Int32Array
		seeds: Int32Array
		count: number
		adjOffset: Int32Array
		adjList: Int32Array
		size: Int32Array
		colors: Float32Array
	}
	religions?: {
		assignment: Int32Array
		seeds: Int32Array
		count: number
		adjOffset: Int32Array
		adjList: Int32Array
		size: Int32Array
		colors: Float32Array
	}
	landmarks?: {
		regionLandmark: Int32Array
		type: Uint8Array
		size: Int32Array
		count: number
	}
	population?: {
		habitability: Float32Array
		population: Float32Array
		totalPopulation: number
	}
}

export type OrogenWorkerRequest =
	| {
		type: "generate"
		params: OrogenParams
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
	}
	| {
		type: "error"
		message: string
		stack?: string
	}

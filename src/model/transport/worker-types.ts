import type {
	OrogenLocations,
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
type SerializedLocations = OrogenLocations
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
	waterAccess?: Uint8Array
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
	locations?: SerializedLocations
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
	/** Per-location trade good index (0=unassigned, 1-based into TRADE_GOOD_LABELS). */
	tradeGoods?: Uint8Array
	settlementRegions?: Int32Array
	settlementWaterLandmarks?: Int32Array
	settlementPortRegions?: Int32Array
	routes?: SerializedRoutes
	network?: SerializedNetwork
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
	cultureBlendSecondary: SerializedProvinceTimelineInt
	cultureBlendWeight: SerializedProvinceTimelineFloat
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
	/** Per-province secondary (bleeding) culture index. -1 = no blend. */
	cultureBlendSecondary: Int32Array
	/** Per-province blend weight [0, 1]. 0 = pure primary culture. */
	cultureBlendWeight: Float32Array
}

export const ROUTE_LAND_MAJOR = 0
export const ROUTE_LAND_MINOR = 1
export const ROUTE_SEA = 2

export type SerializedRouteKind =
	| typeof ROUTE_LAND_MAJOR
	| typeof ROUTE_LAND_MINOR
	| typeof ROUTE_SEA

export interface Route {
	fromProvince: number
	toProvince: number
	kind: SerializedRouteKind
	pathRegions: number[]
}

export interface RouteEdge {
	fromRegion: number
	toRegion: number
	kind: SerializedRouteKind
	usage: number
	weight: number
}

export interface SerializedRoutes {
	fromProvince: Int32Array
	toProvince: Int32Array
	kind: Uint8Array
	pathOffsets: Int32Array
	pathRegions: Int32Array
}

export interface SerializedNetwork {
	fromRegion: Int32Array
	toRegion: Int32Array
	kind: Uint8Array
	usage: Int32Array
	weight: Float32Array
}

export function packRoutes(
	routes: readonly Route[] | null | undefined,
): SerializedRoutes {
	const routeList = routes ?? []
	const fromProvince = new Int32Array(routeList.length)
	const toProvince = new Int32Array(routeList.length)
	const kind = new Uint8Array(routeList.length)
	const pathOffsets = new Int32Array(routeList.length + 1)
	let totalPathLength = 0
	for (let i = 0; i < routeList.length; i++) {
		const route = routeList[i]
		fromProvince[i] = route.fromProvince
		toProvince[i] = route.toProvince
		kind[i] = route.kind
		totalPathLength += route.pathRegions.length
		pathOffsets[i + 1] = totalPathLength
	}
	const pathRegions = new Int32Array(totalPathLength)
	let cursor = 0
	for (const route of routeList) {
		pathRegions.set(route.pathRegions, cursor)
		cursor += route.pathRegions.length
	}
	return {
		fromProvince,
		toProvince,
		kind,
		pathOffsets,
		pathRegions,
	}
}

export function packNetwork(
	edges: readonly RouteEdge[] | null | undefined,
): SerializedNetwork {
	const edgeList = edges ?? []
	const fromRegion = new Int32Array(edgeList.length)
	const toRegion = new Int32Array(edgeList.length)
	const kind = new Uint8Array(edgeList.length)
	const usage = new Int32Array(edgeList.length)
	const weight = new Float32Array(edgeList.length)
	for (let i = 0; i < edgeList.length; i++) {
		const edge = edgeList[i]
		fromRegion[i] = edge.fromRegion
		toRegion[i] = edge.toRegion
		kind[i] = edge.kind
		usage[i] = edge.usage
		weight[i] = edge.weight
	}
	return {
		fromRegion,
		toRegion,
		kind,
		usage,
		weight,
	}
}

export function networkCount(
	network: SerializedNetwork | null | undefined,
): number {
	return network?.kind.length ?? 0
}

export function forEachRoute(
	routes: SerializedRoutes | null | undefined,
	callback: (route: {
		fromProvince: number
		toProvince: number
		kind: SerializedRouteKind
		pathRegions: Int32Array
		index: number
	}) => void,
): void {
	if (!routes) return
	for (let i = 0; i < routes.kind.length; i++) {
		callback({
			fromProvince: routes.fromProvince[i],
			toProvince: routes.toProvince[i],
			kind: routes.kind[i] as SerializedRouteKind,
			pathRegions: routes.pathRegions.subarray(
				routes.pathOffsets[i],
				routes.pathOffsets[i + 1],
			),
			index: i,
		})
	}
}

export function forEachEdge(
	network: SerializedNetwork | null | undefined,
	callback: (edge: {
		fromRegion: number
		toRegion: number
		kind: SerializedRouteKind
		usage: number
		weight: number
		index: number
	}) => void,
): void {
	if (!network) return
	for (let i = 0; i < network.kind.length; i++) {
		callback({
			fromRegion: network.fromRegion[i],
			toRegion: network.toRegion[i],
			kind: network.kind[i] as SerializedRouteKind,
			usage: network.usage[i],
			weight: network.weight[i],
			index: i,
		})
	}
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
				maxElevation?: number
				planetRadiusKm?: number
				obliquity?: number
				eccentricity?: number
				sunTempFactor?: number
				insolationFactor?: number
				daysPerYear?: number
				hoursPerDay?: number
				tidallyLocked?: boolean
				antistellarLon?: number
				perihelion?: number
				pressure?: number
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
	| {
			type: "pathfind-result"
			pathRegions: Int32Array
			distanceKm: number
			landKm: number
			seaKm: number
			travelDays: number
			reachable: boolean
	  }

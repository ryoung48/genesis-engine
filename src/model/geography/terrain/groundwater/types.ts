import type {
	GenesisClimate,
	GenesisHydrology,
	GenesisRainfall,
} from "@/model/climate/types"
import type { GenesisRivers } from "@/model/geography/terrain/rivers/types"
import type { GenesisSurface } from "@/model/geography/terrain/rocks/types"
import type { SphereMesh } from "@/model/mesh/types"

export type SpringKind = "none" | "seepage" | "contact" | "karst" | "piedmont"

export type OasisKind =
	| "none"
	| "river"
	| "spring"
	| "foothill"
	| "fossil"
	| "wells"

export type WetlandKind =
	| "none"
	| "mangrove"
	| "coastalSaltMarsh"
	| "inlandSaltMarsh"
	| "floodplain"
	| "peatBog"
	| "wetMeadow"
	| "marsh"
	| "swampForest"
	| "forestedPeatland"

export interface RegionClimate {
	rain: Float32Array
	pet: Float32Array
	mean: Float32Array
	coldest: Float32Array
	warmest: Float32Array
	wetIndex: Float32Array
}

export interface RegionClimateParams {
	numRegions: number
	temperatureMonthly: Float32Array
	temperatureAvg: Float32Array
	petMonthly: Float32Array
	rainfallAnnual: Float32Array
}

export interface GroundwaterLayers {
	sand: Float32Array
	clay: Float32Array
	soilDepthM: Float32Array
	awcMm: Float32Array
	logK: Float32Array
	transmissivity: Float32Array
	rechargeMm: Float32Array
	rechargeEffMm: Float32Array
	lateralInM3s: Float32Array
	surfaceM3s: Float32Array
	waterTableM: Float32Array
	shallowShare: Uint8Array
	seepShare: Float32Array
	channelRechargeM3s: Float32Array
	wellMm: Float32Array
	spring: Uint8Array
	oasis: Uint8Array
	wetlandShare: Float32Array
	wetlandKind: Uint8Array
	coastFlag: Uint8Array
	wetGw: Float32Array
	wetFlood: Float32Array
	wetCoast: Float32Array
	wetLake: Float32Array
}

export interface GroundwaterStats {
	landRegions: number
	meanRechargeMm: number
	rechargeKm3PerYear: number
	hydrologyBaseflowKm3PerYear: number
	exportedShare: number
	dischargedShare: number
	depthClassShare: number[]
	shallowShare: number[]
	surfaceShare: number
	springCount: Record<SpringKind, number>
	oasisCount: Record<OasisKind, number>
	wellReachableShare: number
	wetlandShare: number
	wetlandAreaKm2: Record<WetlandKind, number>
	wetlandCauseShare: Record<
		"groundwater" | "floodplain" | "coast" | "lake",
		number
	>
	marshRegions: number
	stageMs: number
}

export interface GroundwaterResult {
	layers: GroundwaterLayers
	stats: GroundwaterStats
}

export interface GroundwaterComputeParams {
	mesh: SphereMesh
	elevationKm: Float32Array
	isLand: Uint8Array
	lakeKind: Uint8Array
	openWater: Uint8Array
	pastaClimate: Uint8Array
	climate: Pick<
		GenesisClimate,
		"temperature_monthly" | "temperature_avg" | "pet_monthly"
	>
	rainfall: Pick<GenesisRainfall, "annual">
	hydrology: Pick<GenesisHydrology, "runoff_annual" | "baseflow_monthly">
	rivers: Pick<GenesisRivers, "flow" | "flow_monthly" | "waterLevel">
	tidalRange: Float32Array
	shelter: Float32Array
	vegetation: Uint8Array
	surface: Pick<GenesisSurface, "rock" | "youngKind" | "glaciated">
	planetRadiusKm: number
	secondsPerYear: number
	maxElevKm: number
	maxDepthKm: number
}

export interface StatisticsParams {
	layers: GroundwaterLayers
	active: Uint8Array
	areaKm2: Float64Array
	baseflowMonthly: Float32Array
	exportedM3s: number
	dischargedM3s: number
	rechargeM3s: number
	stageMs: number
}

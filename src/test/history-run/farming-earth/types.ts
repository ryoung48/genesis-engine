import type { WayOfLife } from "@/model/society/farming/types"

export type Mode = "forage" | "herd" | "farm"

export interface PinhasiSite {
	site: string
	latitude: number
	longitude: number
	year: number
	sd: number
}

export interface RegionFeature {
	id: number
	name: string
	rings: [number, number][][]
}

export interface LanduseRow {
	regionId: number
	wayOfLife: Mode
	year: number
	level: string
}

export interface SourceRecord {
	name: string
	file: string
	url: string
	version: string
	licence: string
	sha256: string
}

export interface ReferenceData {
	sites: PinhasiSite[] | null
	regions: RegionFeature[] | null
	landuse: LanduseRow[] | null
	sources: SourceRecord[] | null
	missing: string[]
}

export interface ProvincePoints {
	latDeg: Float64Array
	lonDeg: Float64Array
}

export interface ProvincePointsParams {
	seeds: Int32Array
	r_xyz: Float32Array
}

export interface DistanceParams {
	aLat: number
	aLon: number
	bLat: number
	bLon: number
}

export interface NearestParams {
	latitude: number
	longitude: number
	points: ProvincePoints
	mask: Uint8Array
}

export interface NearestResult {
	province: number
	distanceKm: number
}

export interface CentreRecord {
	name: string
	latitude: number
	longitude: number
	bp: number
}

export interface CentresParams {
	points: ProvincePoints
	mask: Uint8Array
	farmingYear: Int32Array
	hearths: { province: number; fired: boolean }[]
}

export interface PinhasiParams {
	sites: PinhasiSite[]
	points: ProvincePoints
	mask: Uint8Array
	farmingYear: Int32Array
}

export interface FrontSpeedParams {
	distances: number[]
	years: number[]
}

export interface ErrorSummaryParams {
	errors: number[]
}

export interface RegionMembersParams {
	regions: RegionFeature[]
	points: ProvincePoints
	mask: Uint8Array
}

export interface InsideParams {
	region: RegionFeature
	lat: number
	lon: number
}

export interface ModeOfParams {
	province: number
	year: number
}

export interface WayOfLifeParams {
	regions: RegionFeature[]
	landuse: LanduseRow[]
	members: number[][]
	areaKm2: Float64Array
	modeOf: (params: ModeOfParams) => WayOfLife
	capacities: { forage: Float32Array; farm: Float32Array; herd: Float32Array }
}

export interface DominantParams {
	score: Record<Mode, number>
}

export interface PercentileParams {
	values: number[]
	fraction: number
}

export interface ExpertLevelsParams {
	landuse: LanduseRow[]
	regionId: number
	year: number
}

export interface WorktreeWayOfLifeParams {
	regions: RegionFeature[]
	landuse: LanduseRow[]
	members: number[][]
	modeOf: (params: ModeOfParams) => WayOfLife
}

export interface HydeSeries {
	years: number[]
	areaKm2: Float64Array
	population: (year: number) => Float64Array | null
}

export interface DensityCell {
	population: number
	areaKm2: number
}

export interface DensityDistribution {
	totalPopulation: number
	totalAreaKm2: number
	populationShareByBin: number[]
	areaShareByBin: number[]
	densestTenthPopulationShare: number
}

export interface DistributionParams {
	cells: DensityCell[]
}

export interface HydeComparison {
	year: number
	bins: string[]
	hyde: DensityDistribution
	model: DensityDistribution
	populationShareDistance: number
	areaShareDistance: number
}

export interface ShareDistanceParams {
	a: number[]
	b: number[]
}

export interface HydeCompareParams {
	year: number
	hyde: DensityCell[]
	model: DensityCell[]
}

export interface TechLevelCheckParams {
	settledScore: number
}

export interface TechLevelAtParams {
	year: number
}

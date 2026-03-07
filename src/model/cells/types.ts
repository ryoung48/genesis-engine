import { Point } from "../utilities/points/types"

export type Vegetation =
	| "desert"
	| "sparse"
	| "grasslands"
	| "woods"
	| "forest"
	| "jungle"

export type Climate =
	| "arctic"
	| "subarctic"
	| "boreal"
	| "temperate"
	| "subtropical"
	| "tropical"

export interface Cell extends Point {
	idx: number
	score: number
	// coastal attributes
	coastalEdges?: [Point, Point][]
	isCoast?: boolean
	waterSources?: Set<number>
	// mountains
	isMountains?: boolean
	mountain?: number
	plateau?: boolean
	// location
	location: number
	province: number
	// features
	h: number
	elevation: number
	landmark: number
	isWater?: boolean
	wasLake?: boolean
	beach?: boolean
	ocean?: boolean
	oceanRegion?: number
	shallow?: boolean
	moisture: { east: number; west: number }
	rain?: {
		annual: number
		monthly: number[]
		weights?: {
			itcz: number
			suppression: number
			eastStorms: number
			polar: number
			w: number
		}[]
	}
	heat?: {
		mean: number
		max: number
		min: number
		monthly?: number[]
		monthlyE?: number[]
	}
	wind?: { monthly: number[]; annual: number }
	topography?: "coastal" | "marsh" | "flat" | "hills" | "plateau" | "mountains"
	vegetation?: Vegetation
	climate?: Climate
	// distances
	oceanDist: number
	mountainDist: number
	landDist: number
}

export interface CellSpawnParams {
	idx: number
	point: [number, number]
}

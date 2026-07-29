import type { SphereMesh } from "@/model/mesh/types"

export interface MatchRealLakeNamesParams {
	mesh: SphereMesh
	landmarks: { regionLandmark: Int32Array; type: Uint8Array; count: number }
	lakeLandmarkType: number
	lakePolygons: { name: string; ring: [number, number][] }[]
}

export interface MergeEu4LandMaskParams {
	mask: Uint8Array
	eu4Raster: Int16Array
	eu4Nodata: number
}

export interface ReconcileElevationWithMaskParams {
	elevation: Float32Array
	maskIsLand: Uint8Array
	epsilon: number
}

export interface PointInRingParams {
	lonDeg: number
	latDeg: number
	ring: [number, number][]
}

export interface RealRiverLineInput {
	points: number[] // flat [lon0, lat0, lon1, lat1, ...] degrees
	strokeweig: number
	name?: string | null
}

export interface RealProvinceInput {
	name: string
	lon: number
	lat: number
	weight: number
}

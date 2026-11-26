import type { SphereMesh } from "@/model/mesh/types"

export interface BasinLayoutParams {
	basinId: Int32Array
	elevation: Float32Array
}

export interface BasinLayout {
	cells: number[][]
	lowest: Int32Array
}

export interface BasinOutletsParams {
	basinId: Int32Array
	drainTarget: Int32Array
	basinCount: number
}

export interface EvaporationDeficitParams {
	petMonthly: Float32Array
	rainfallAnnual: Float32Array
	numRegions: number
}

export interface BasinVerdictParams {
	inflowM3s: number
	cells: number[]
	deficitMm: Float32Array
	areaM2: Float64Array
	secondsPerYear: number
}

export interface BasinVerdict {
	terminal: boolean
	evaporationM3s: number
}

export interface OpenLakeKindParams {
	inflowM3s: number
	evaporationM3s: number
}

export type OpenLakeKind = "fresh" | "brackish" | "salt"

export interface WaterBodiesParams {
	mesh: Pick<SphereMesh, "numRegions" | "adjOffset" | "adjList">
	elevation: Float32Array
	layout: BasinLayout
	terminal: Uint8Array
	inflowM3s: Float32Array
	sill: Float32Array
	deficitMm: Float32Array
	areaM2: Float64Array
	secondsPerYear: number
	floorFraction: number
}

export interface BasinWaterBody {
	lake: number[]
	pan: number[]
}

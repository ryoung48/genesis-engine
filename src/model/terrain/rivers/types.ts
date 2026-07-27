import type {
	GenesisClimate,
	GenesisHydrology,
	GenesisRainfall,
} from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export interface GenesisRivers {
	/** Each river is a polyline of [lonDeg, latDeg, flow, elevation] quads */
	lines: [number, number, number, number][][]
	/** Maximum flow value for normalization */
	maxFlow: number
	/** Flow threshold (minimum flow for a river cell), in m3/s */
	minFlow: number
	/** Per-cell mean discharge from upstream thawed-rain runoff, in m3/s */
	flow: Float32Array
	/** Per-cell monthly discharge, length 12*N, indexed [month*N + r], in m3/s */
	flow_monthly: Float32Array
	/** Per-cell flag for cells that belong to a rendered river polyline */
	visible: Uint8Array
	/** Per-cell river system ID (-1 = not a river cell). Tributaries share the main river's ID. */
	riverId: Int32Array
	/** Real-world name per river system ID (Earth import only), indexed by riverId. */
	riverNames?: (string | null)[]
	/** Per-cell total length of the visible river system, in km. */
	riverLengthKm: Float32Array
	/** Per-cell terminal flag for the last visible river cell before its sink. */
	terminal: Uint8Array
	/** Terminal river cells that drain into ocean or other non-land water. */
	terminalCoastal: Uint8Array
	/** Terminal river cells that end in inland basins, lakes, or playas. */
	terminalInterior: Uint8Array
	/** Per-cell enclosed basin ID (-1 = not assigned to a basin) */
	basinId: Int32Array
	/** Per-cell water surface elevation (only meaningful for lake cells) */
	waterLevel: Float32Array
}

export interface ComputeRiversParams {
	mesh: SphereMesh
	elevation: Float32Array
	rainfall: GenesisRainfall
	climate: GenesisClimate
	hydrology: GenesisHydrology
	isLand: Uint8Array
	params?: Pick<GenesisParams, "planetRadiusKm" | "daysPerYear" | "hoursPerDay">
}

export interface PolylineLengthKmParams {
	line: [number, number, number, number][]
	radiusKm: number
}

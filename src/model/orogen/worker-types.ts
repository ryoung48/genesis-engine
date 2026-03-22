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
	landFraction: number[]
}

export interface SerializedOrogenWorld {
	mesh: SerializedSphereMesh
	plateAssignment: Int32Array
	elevation: Float32Array
	params: OrogenParams
	continentCount?: number
	climate?: SerializedOrogenClimate
	oceanDist?: Float32Array
	distCoast?: Float32Array
	rainfall?: { monthly: Float32Array; annual: Float32Array; east: Float32Array; west: Float32Array }
	climateZones?: Uint8Array
	pastaClimate?: Uint8Array
	koppenClimate?: Uint8Array
	vegetation?: Uint8Array
	isLand?: Uint8Array
	riverLand?: Uint8Array
	rivers?: { lines: [number, number, number, number][][]; maxFlow: number; minFlow: number; lakes: Uint8Array; waterLevel: Float32Array }
	oceanCurrents?: { oceanWarmth: Float32Array; coastalWarmth: Float32Array }
	wind?: {
		wind_east_monthly: Float32Array
		wind_north_monthly: Float32Array
		wind_speed_monthly: Float32Array
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
			planetRadiusKm?: number
			obliquity?: number
			eccentricity?: number
			sunTempFactor?: number
			daysPerYear?: number
			hoursPerDay?: number
			tidallyLocked?: boolean
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

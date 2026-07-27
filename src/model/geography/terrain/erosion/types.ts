import type { SphereMesh } from "@/model/mesh/types"

export interface GlacialBuffers {
	glacIdx: Float32Array
	iceTarget: Int32Array
	iceFlow: Float32Array
	numIceUpstream: Uint8Array
}

export interface BuildGlacialBuffersParams {
	N: number
	r_xyz: Float32Array
	r_isOcean: Uint8Array
	elev: Float32Array
	glacialStrength: number
}

export interface WarpTerrainParams {
	mesh: SphereMesh
	elev: Float32Array
	seed: number
	strength: number
	r_hotspot?: Float32Array | null
}

export interface SmoothElevationParams {
	mesh: SphereMesh
	elev: Float32Array
	r_isOcean: Uint8Array
	iterations: number
	strength: number
}

export interface SharpenRidgesParams {
	mesh: SphereMesh
	elev: Float32Array
	r_isOcean: Uint8Array
	iterations: number
	strength: number
}

export interface ApplySoilCreepParams {
	mesh: SphereMesh
	elev: Float32Array
	r_isOcean: Uint8Array
	iterations: number
	strength: number
}

export interface DiffuseIterationParams {
	cells: ArrayLike<number>
	elev: Float32Array
	N: number
	iterations: number
	compute: (r: number) => number
}

export interface PriorityFloodCarveParams {
	mesh: SphereMesh
	elev: Float32Array
	r_isOcean: Uint8Array
	carveStrength: number
}

export interface ErodeCompositeParams {
	mesh: SphereMesh
	elev: Float32Array
	r_isOcean: Uint8Array
	hIters: number
	K: number
	m: number
	dt: number
	tIters: number
	talusSlope: number
	kThermal: number
	gIters?: number
	glacialStrength?: number
}

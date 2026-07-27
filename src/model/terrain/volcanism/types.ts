import type { SphereMesh } from "@/model/mesh/types"
import type { BoundaryInfo } from "@/model/tectonics/types"

export interface TangentFrame {
	ux: number
	uy: number
	uz: number
	vx: number
	vy: number
	vz: number
}

export interface LipSite {
	x: number
	y: number
	z: number
	height: number
	sigma: number
}

export interface VolcanicArcParams {
	mesh: SphereMesh
	elevation: Float32Array
	boundary: BoundaryInfo
	maxStress: number
	seed: number
	volcanism: number
	markFeature: TerrainFeatureMarker
}

export interface AppendLipSitesParams {
	x: number
	y: number
	z: number
	drift: [number, number, number]
	upwelling: number
	volcanism: number
	isOcean: boolean
	random: () => number
}

export interface LargeIgneousProvinceParams {
	mesh: SphereMesh
	elevation: Float32Array
	lipSites: LipSite[]
	seed: number
	markFeature: TerrainFeatureMarker
}

type TerrainFeatureMarker = (
	region: number,
	feature: number,
	delta: number,
) => void

export interface BuildTangentFrameParams {
	px: number
	py: number
	pz: number
	dx: number
	dy: number
	dz: number
}

export interface GetScaledFeatureCountParams {
	baseCount: number
	volcanism: number
}

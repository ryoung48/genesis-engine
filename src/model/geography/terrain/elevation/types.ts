import type {
	BoundaryInfo,
	DistanceFields,
	PlateVec,
} from "@/model/geography/tectonics/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { SimplexNoise } from "@/model/shared/math/simplex-noise"

type StageTiming = { Stage: string; ms: string }

type FbmFn = (x: number, y: number, z: number, octaves?: number) => number
type MarkFeatureFn = (r: number, feature: number, delta: number) => void

export interface BoundedBfsParams {
	dist: Float32Array
	seeds: number[]
	halfWidth: number
	adjOffset: Int32Array
	adjList: Int32Array
	canVisit: (nr: number, r: number) => boolean
}

export interface ComputeDistanceFieldsParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plateIsOcean: Set<number>
	boundary: BoundaryInfo
	seed: number
}

export interface AssignDistanceFieldParams {
	mesh: SphereMesh
	seeds: Iterable<number>
	stops: Set<number>
	seedVal: number
}

export interface BlendElevationParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plateVec: Map<number, PlateVec>
	plateIsOcean: Set<number>
	distFields: DistanceFields
	boundary: BoundaryInfo
	roughness: number
	volcanism: number
	seed: number
	timing?: StageTiming[]
}

export interface StressMountainSeedsParams {
	boundary: BoundaryInfo
}

export interface OceanLandMaskParams {
	numRegions: number
	r_plate: Int32Array
	plateIsOcean: Set<number>
}

export interface CoastAdjacencyParams {
	mesh: SphereMesh
	r_isOcean: Uint8Array
}

export interface LandCoastSeedsResult {
	landCoastSeeds: Set<number>
	oceanBarriers: Set<number>
}

export interface StressNormalizationParams {
	numRegions: number
	r_stress: Float32Array
}

export interface RiftBfsParams {
	mesh: SphereMesh
	r_boundaryType: Int8Array
	r_hasOcean: Uint8Array
	r_isOcean: Uint8Array
	r_plate: Int32Array
	scaleFactor: number
}

export interface RiftBfsResult {
	riftDist: Float32Array
	riftHalfWidth: number
}

export interface PullApartBfsParams {
	mesh: SphereMesh
	r_boundaryType: Int8Array
	r_hasOcean: Uint8Array
	r_isOcean: Uint8Array
	scaleFactor: number
}

export interface PullApartBfsResult {
	pullApartDist: Float32Array
	pullApartHalfWidth: number
}

export interface RidgeBfsParams {
	mesh: SphereMesh
	r_boundaryType: Int8Array
	r_bothOcean: Uint8Array
	r_isOcean: Uint8Array
	scaleFactor: number
}

export interface RidgeBfsResult {
	ridgeDist: Float32Array
	ridgeHalfWidth: number
}

export interface FractureBfsParams {
	mesh: SphereMesh
	r_boundaryType: Int8Array
	r_bothOcean: Uint8Array
	r_isOcean: Uint8Array
	scaleFactor: number
}

export interface FractureBfsResult {
	fractureDist: Float32Array
	fractureHalfWidth: number
}

export interface BackArcBfsParams {
	mesh: SphereMesh
	r_boundaryType: Int8Array
	r_hasOcean: Uint8Array
	r_subductFactor: Float32Array
	r_stress: Float32Array
	r_plate: Int32Array
	maxStress: number
	scaleFactor: number
}

export interface BackArcBfsResult {
	backArcDist: Float32Array
	backArcStress: Float32Array
	baStart: number
	baPeak: number
	baEnd: number
}

export interface CoastBoundaryBfsParams {
	mesh: SphereMesh
	r_isOcean: Uint8Array
	r_stress: Float32Array
	r_subductFactor: Float32Array
	r_boundaryType: Int8Array
	maxStress: number
	scaleFactor: number
}

export interface CoastBoundaryBfsResult {
	coastBdry: number[]
	r_coastDist: Float32Array
	coastStressMax: Float32Array
	coastSubductMax: Float32Array
	coastConvergent: Uint8Array
	maxCD: number
}

/** Shared read/write context for the per-region land and ocean elevation steps. */
export interface ElevationRegionContext {
	distMountain: Float32Array
	distCoast: Float32Array
	distCoastLand: Float32Array
	r_plate: Int32Array
	plateVec: Map<number, PlateVec>
	riftDist: Float32Array
	riftHalfWidth: number
	pullApartDist: Float32Array
	pullApartHalfWidth: number
	backArcDist: Float32Array
	backArcStress: Float32Array
	baStart: number
	baPeak: number
	baEnd: number
	ridgeDist: Float32Array
	ridgeHalfWidth: number
	fractureDist: Float32Array
	fractureHalfWidth: number
	coastConvergent: Uint8Array
	scaleFactor: number
	interiorBand: number
	tectonicReach: number
	plateauStart: number
	noiseMag: number
	fbm: FbmFn
	ridgedFbm: FbmFn
	foldFbm: FbmFn
	riftFbm: FbmFn
	noise: SimplexNoise
	elev: Float32Array
	markFeature: MarkFeatureFn
	backArc: Float32Array
	foldRidge: Float32Array
	margins: Float32Array
}

export interface LandRegionElevationParams {
	r: number
	x: number
	y: number
	z: number
	wx: number
	wy: number
	wz: number
	sf: number
	stressNorm: number
	genesisicPower: number
	ctx: ElevationRegionContext
}

export interface OceanRegionElevationParams {
	r: number
	x: number
	y: number
	z: number
	wx: number
	wy: number
	wz: number
	btype: number
	stressNorm: number
	ctx: ElevationRegionContext
}

export interface CoastalRougheningParams {
	numRegions: number
	r_xyz: Float32Array
	r_coastDist: Float32Array
	coastStressMax: Float32Array
	coastSubductMax: Float32Array
	coastConvergent: Uint8Array
	r_isOcean: Uint8Array
	r_stress: Float32Array
	maxStress: number
	scaleFactor: number
	noiseMag: number
	seed: number
	fbm: FbmFn
	elev: Float32Array
	coastal: Float32Array
	markFeature: MarkFeatureFn
}

export interface IslandArcsParams {
	mesh: SphereMesh
	r_plate: Int32Array
	r_isOcean: Uint8Array
	r_boundaryType: Int8Array
	r_bothOcean: Uint8Array
	r_subductFactor: Float32Array
	r_stress: Float32Array
	maxStress: number
	scaleFactor: number
	volcanism: number
	seed: number
	elev: Float32Array
	markFeature: MarkFeatureFn
}

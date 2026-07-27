import type { SphereMesh } from "../types/mesh"
import type { PlateVec } from "../types/tectonics"
import type { SimplexNoise } from "../shared/simplex-noise"

export interface ProjectCoarsePlatesParams {
	mesh: SphereMesh
	coarseMesh: SphereMesh
	coarse_r_plate: Int32Array
	seed: number
	numPlates: number
}

export interface PlateVelocityAtParams {
	plateVec: Map<number, PlateVec>
	plateId: number
	x: number
	y: number
	z: number
}

export interface FindCollisionsParams {
	mesh: SphereMesh
	r_xyz: Float32Array
	plateIsOcean: Set<number>
	r_plate: Int32Array
	plateVec: Map<number, PlateVec>
	plateDensity: Map<number, number>
	noise: SimplexNoise
}

export interface PropagateStressParams {
	mesh: SphereMesh
	r_stress: Float32Array
	r_subductFactor: Float32Array
	r_plate: Int32Array
	plateIsOcean: Set<number>
	decayFactor: number
	subductDecayFactor: number
	numPasses: number
}

export interface ComputeMantleFieldParams {
	plateVec: Map<number, PlateVec>
	plateSeeds: Iterable<number>
	plateIsOcean: Set<number>
	r_plate: Int32Array
	mesh: SphereMesh
	seed: number
}

export interface BuildSuperPlatesParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plateSeeds: number[]
	plateVec: Map<number, PlateVec>
	plateIsOcean: Set<number>
	plateDensity: Map<number, number>
}

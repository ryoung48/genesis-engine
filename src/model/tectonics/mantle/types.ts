import type { PlateVec } from "@/model/types/tectonics"
import type { SphereMesh } from "@/model/types/mesh"

export interface MantleCell {
	pos: Vec3
	radialSign: number
	rotSign: number
	strength: number
}

export type Vec3 = [number, number, number]

export interface ComputeMantleFieldParams {
	plateVec: Map<number, PlateVec>
	plateSeeds: Iterable<number>
	plateIsOcean: Set<number>
	r_plate: Int32Array
	mesh: SphereMesh
	seed: number
}

export interface DotParams {
	a: Vec3
	b: Vec3
}

export interface CrossParams {
	a: Vec3
	b: Vec3
}

export interface SubParams {
	a: Vec3
	b: Vec3
}

export interface AngularDistanceParams {
	a: Vec3
	b: Vec3
}

export interface VelocityAtParams {
	plate: PlateVec
	pos: Vec3
}

export interface ProjectMantleFieldToRegionsParams {
	coarseMantleField: Float32Array
	coarseMesh: SphereMesh
	mesh: SphereMesh
}

import type { SphereMesh } from "@/model/mesh/types"
import type { SimplexNoise } from "@/model/shared/simplex-noise"
import type { PlateVec, SuperPlateData } from "@/model/tectonics/types"

type StageTiming = { Stage: string; ms: string }

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

export interface ClassifyBoundariesParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plateSeeds: number[]
	plateVec: Map<number, PlateVec>
	plateIsOcean: Set<number>
	plateDensity: Map<number, number>
	superPlateData: SuperPlateData | null
	seed: number
	spread: number
	timing?: StageTiming[]
}

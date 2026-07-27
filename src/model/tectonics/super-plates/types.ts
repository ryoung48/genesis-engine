import type { SphereMesh } from "@/model/mesh/types"
import type { PlateVec } from "@/model/tectonics/types"

export interface BuildSuperPlatesParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plateSeeds: number[]
	plateVec: Map<number, PlateVec>
	plateIsOcean: Set<number>
	plateDensity: Map<number, number>
}

import type { SphereMesh } from "@/model/types/mesh"
import type { PlateVec } from "@/model/types/tectonics"

export interface BuildSuperPlatesParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plateSeeds: number[]
	plateVec: Map<number, PlateVec>
	plateIsOcean: Set<number>
	plateDensity: Map<number, number>
}

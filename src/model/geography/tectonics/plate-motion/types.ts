import type {
	PlateVec,
	SuperPlateData,
} from "@/model/geography/tectonics/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface MovingPlates {
	cellPlate: Int32Array
	vec: Map<number, PlateVec>
	isOcean: Set<number>
	density: Map<number, number>
}

export interface BuildMovingPlatesParams {
	r_plate: Int32Array
	plateVec: Map<number, PlateVec>
	plateIsOcean: Set<number>
	plateDensity: Map<number, number>
	superPlateData: SuperPlateData | null
}

export interface PlateMotion {
	plates: MovingPlates
	cmYrPerUnit: number
}

export interface BuildPlateMotionParams {
	mesh: SphereMesh
	plates: MovingPlates
}

export interface VelocityCmYrParams {
	motion: PlateMotion
	plate: number
	x: number
	y: number
	z: number
}

export interface VelocityUnitsParams {
	plates: MovingPlates
	plate: number
	x: number
	y: number
	z: number
}

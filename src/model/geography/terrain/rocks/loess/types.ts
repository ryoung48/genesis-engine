import type { SimMesh } from "@/model/geography/tectonics/sim-mesh/types"
import type { WorldSample } from "@/model/geography/tectonics/world-sample/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface LoessParams {
	simMesh: SimMesh
	sample: WorldSample
	mesh: SphereMesh
	planetRadiusKm: number
	isLand: Uint8Array
	koppen: Uint8Array
	till: Float32Array
	windU: Float32Array
	windV: Float32Array
	temperatureAvg: Float32Array
	elevationKm: Float32Array
}

export interface DustSourceParams {
	simMesh: SimMesh
	sample: WorldSample
	isLand: Uint8Array
	koppen: Uint8Array
	till: Float32Array
}

export interface DustCarryParams {
	simMesh: SimMesh
	sample: WorldSample
	planetRadiusKm: number
	source: Float32Array
	windU: Float32Array
	windV: Float32Array
}

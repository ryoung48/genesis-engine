import type { SphereMesh } from "@/model/types/mesh"

export type AssignKoppenClimateParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	temperatureMonthly: Float32Array
	rainfallMonthly: Float32Array
}

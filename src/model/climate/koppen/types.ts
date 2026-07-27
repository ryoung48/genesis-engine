import type { SphereMesh } from "@/model/mesh/types"

export type AssignKoppenClimateParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	temperatureMonthly: Float32Array
	rainfallMonthly: Float32Array
}

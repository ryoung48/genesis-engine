import type { SphereMesh } from "@/model/mesh/types"
import type { CellRange } from "@/model/shared/parallel/types"

export type AssignKoppenClimateParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	temperatureMonthly: Float32Array
	rainfallMonthly: Float32Array
}

export interface KoppenCellsParams extends CellRange {
	isLand: Uint8Array
	temperatureMonthly: Float32Array
	rainfallMonthly: Float32Array
	classes: Uint8Array
}

import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type { WorldSample } from "@/model/geography/tectonics/world-sample/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface GenesisAtolls {
	region: Int32Array
	ageMyr: Float32Array
	peakKm: Float32Array
	xyz: Float32Array
}

export type AtollCrust = Pick<
	CrustRaster,
	"numCells" | "volcType" | "type" | "volcKm" | "volcWornKm"
>

export interface AtollSitesParams {
	mesh: SphereMesh
	crust: AtollCrust
	sample: Pick<WorldSample, "regionOfCell">
	isLand: Uint8Array
	openWater: Uint8Array
	temperatureMonthly: Float32Array
}

export interface AtollRemnantParams {
	crust: AtollCrust
	cell: number
}

export interface AtollRemnant {
	ageMyr: number
	peakKm: number
}

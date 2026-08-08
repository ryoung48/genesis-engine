import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type ComputeTornadoRiskParams = {
	mesh: SphereMesh
	temperatureAvg: Float32Array
	temperatureMax: Float32Array
	temperatureMin: Float32Array
	isLand: Uint8Array
	topography: Uint8Array
	vegetation: Uint8Array
	oceanDist: Float32Array
	params: Pick<GenesisParams, "hoursPerDay" | "tideLock">
}

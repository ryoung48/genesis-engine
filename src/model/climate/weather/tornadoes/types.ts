import type { ClimateV2Circulation } from "@/model/climatev2/types"
import type { CirculationBelts } from "@/model/climatev2/vendor/circulation.js"
import type { SphereMesh } from "@/model/mesh/types"

export type ComputeTornadoRiskParams = {
	mesh: SphereMesh
	temperatureAvg: Float32Array
	temperatureMax: Float32Array
	temperatureMin: Float32Array
	isLand: Uint8Array
	topography: Uint8Array
	vegetation: Uint8Array
	oceanDist: Float32Array
	circulation: ClimateV2Circulation | null
}

export type StormBeltFactorParams = {
	lat: number
	belts: CirculationBelts[]
}

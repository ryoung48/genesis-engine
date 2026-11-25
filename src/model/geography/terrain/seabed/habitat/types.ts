import type { SphereMesh } from "@/model/mesh/types"

export type SeabedHabitat = "none" | "coral" | "kelp" | "seagrass" | "rockyReef"

export interface SeabedReachParams {
	mesh: SphereMesh
	isLand: Uint8Array
	openWater: Uint8Array
	planetRadiusKm: number
}

export interface SeabedShareParams {
	source: Int32Array
	elevationKm: Float32Array
	flow: Float32Array
}

export interface SeabedSubstrateParams {
	source: Int32Array
	shoreMaterial: Uint8Array
}

export interface SeabedClassifyParams {
	numRegions: number
	source: Int32Array
	share: Uint8Array
	substrate: Uint8Array
	exposureLeeM: Float32Array
	temperatureMonthly: Float32Array
	iceMinMonthly: Float32Array
	iceMaxMonthly: Float32Array
}

export interface SeabedHabitatOfParams {
	substrate: number
	coldestC: number
	warmestC: number
	iceMonths: number
	leeM: number
}

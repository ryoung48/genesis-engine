import type { CrustRaster } from "@/model/geography/tectonics/crust/types"

export interface GrainParams {
	crust: CrustRaster
	seed: number
}

export interface GrainFields {
	acrossKm: Float32Array
	beltW: Float32Array
	axisX: Float32Array
	axisY: Float32Array
	axisZ: Float32Array
}

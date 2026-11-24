import type { CrustRaster } from "@/model/geography/tectonics/crust/types"

export interface BasementScoresParams {
	crust: CrustRaster
	seed: number
}

export interface BasementScores {
	score: Float32Array
	greenShare: Float32Array
	suture: Float32Array
	lavaCap: Float32Array
	rising: Float32Array
	land: Uint8Array
}

export interface MetamorphicShareParams {
	score: Float32Array
	base: number
	share: number
	granite: number
	slate: number
	gneiss: number
}

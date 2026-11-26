export type ShoreMaterial = "none" | "ice" | "rock" | "gravel" | "sand" | "mud"

export interface ShoreMaterialParams {
	coastal: Uint8Array
	keyCode: Uint8Array
	sand: Float32Array
	pastaClimate: Uint8Array
	relief: Uint8Array
	exposureOpenM: Float32Array
	flow: Float32Array
	volcano: Float32Array
}

export interface ShoreMaterialLayer {
	material: Uint8Array
	volcanicSand: Uint8Array
}

export interface MaterialOfParams {
	resist: number
	isTill: boolean
	isIce: boolean
	freshVolcanic: boolean
	relief: number
	exposureClass: number
	sandShare: number
	flowM3s: number
}

export interface MaterialOfResult {
	material: number
	volcanicSand: boolean
}

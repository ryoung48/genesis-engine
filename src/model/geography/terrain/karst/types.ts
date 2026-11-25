export type KarstKind = "none" | "carbonate" | "coveredCarbonate" | "evaporite"

export type KarstActivity = "none" | "relict" | "active" | "spring"

export interface KarstClassifyParams {
	numRegions: number
	isLand: Uint8Array
	iced: Uint8Array
	rock: Uint8Array
	bedrock: Uint8Array
	rain: Float32Array
	mean: Float32Array
	spring: Uint8Array
}

export interface KarstLayers {
	kind: Uint8Array
	potential: Float32Array
	activity: Uint8Array
	water: Float32Array
}

export interface KarstKindOfParams {
	rock: number
	bedrock: number
}

export interface KarstKindResult {
	kind: number
	covered: boolean
}

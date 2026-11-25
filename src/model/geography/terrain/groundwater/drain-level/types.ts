export interface IncisionParams {
	reliefM: number
}

export interface DrainLevelParams {
	drainTarget: Int32Array
	processOrder: Int32Array
	heightM: Float32Array
	reliefM: Float32Array
	waterLevelM: Float32Array
	water: Uint8Array
	pan: Uint8Array
	wet: Uint8Array
}

export interface DrainLevel {
	incisionM: Float32Array
	headM: Float32Array
	offsetM: Float32Array
}

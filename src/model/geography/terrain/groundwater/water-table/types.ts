export interface HillParams {
	mound: number
	rise: number
	depth: number
}

export interface HillMeanParams {
	mound: number
	rise: number
}

export interface StreamSpacingParams {
	density: number
	transmissivity: number
	rise: number
	recharge: number
}

export interface WaterTableParams {
	transmissivity: Float64Array
	effective: Float64Array
	incisionM: Float32Array
	offsetM: Float32Array
	headM: Float32Array
	heightM: Float32Array
	slope: Float32Array
	widthM: Float64Array
	dissect: Float32Array
	glaciated: Uint8Array
	band: Float32Array
	shore: Uint8Array
	active: Uint8Array
}

export interface WaterTable {
	meanDepthM: Float32Array
	shallowShare: Uint8Array
	seepShare: Float32Array
}

export interface DensityParams {
	dissect: number
	slope: number
	glaciated: boolean
}

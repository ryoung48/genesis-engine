export interface WetlandCauses {
	groundwater: number
	floodplain: number
	coast: number
	lake: number
}

export interface WetlandKindParams {
	causes: WetlandCauses
	wetIndex: number
	mean: number
	coldest: number
	warmest: number
	seepShare: number
	saltShore: boolean
	forested: boolean
}

export interface CombineParams {
	causes: WetlandCauses
}

export interface WetlandsParams {
	shallowShare: Uint8Array
	flow: Float32Array
	widthM: Float64Array
	slope: Float32Array
	tidalRange: Float32Array
	shelter: Float32Array
	touchesSea: Uint8Array
	touchesLake: Uint8Array
	touchesSalt: Uint8Array
	seepShare: Float32Array
	wetIndex: Float32Array
	mean: Float32Array
	coldest: Float32Array
	warmest: Float32Array
	forested: Uint8Array
	active: Uint8Array
}

export interface WetlandLayer {
	share: Float32Array
	kind: Uint8Array
	coastFlag: Uint8Array
	wetGw: Float32Array
	wetFlood: Float32Array
	wetCoast: Float32Array
	wetLake: Float32Array
}

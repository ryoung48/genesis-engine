export interface OasesParams {
	wetIndex: Float32Array
	pet: Float32Array
	rain: Float32Array
	flow: Float32Array
	areaM2: Float64Array
	band: Float32Array
	channelM3s: Float32Array
	effective: Float64Array
	qem: Float64Array
	shallowShare: Uint8Array
	heightM: Float32Array
	aquifer: Uint8Array
	adjOffset: Int32Array
	adjList: Int32Array
	secondsPerYear: number
	active: Uint8Array
}

export interface FrontSupplyParams {
	wetIndex: Float32Array
	effective: Float64Array
	areaM2: Float64Array
	heightM: Float32Array
	adjOffset: Int32Array
	adjList: Int32Array
	active: Uint8Array
}

export interface DepressionParams {
	region: number
	heightM: Float32Array
	adjOffset: Int32Array
	adjList: Int32Array
	active: Uint8Array
}

export interface OasisLayer {
	oasis: Uint8Array
	wellMm: Float32Array
	wellReach: Float32Array
}

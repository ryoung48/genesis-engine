export interface CascadeParams {
	drainTarget: Int32Array
	processOrder: Int32Array
	targetDistM: Float32Array
	headM: Float32Array
	active: Uint8Array
	pan: Uint8Array
	karst: Uint8Array
	recharge: Float64Array
	areaM2: Float64Array
	transmissivity: Float64Array
}

export interface CascadeResult {
	qin: Float64Array
	qout: Float64Array
	qem: Float64Array
	qkarst: Float64Array
	effective: Float64Array
	exportedM3s: number
	dischargedM3s: number
}

export interface CapacityParams {
	transmissivity: number
	headDropM: number
	distM: number
}

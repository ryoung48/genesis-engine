export interface BuildChildrenCSRParams {
	parent: Int32Array<ArrayBufferLike>
	provinceCount: number
}

export interface BuildSovereignParams {
	parent: Int32Array<ArrayBufferLike>
	provinceCount: number
}

export interface OverextendedParams {
	lordRank: number
	vassalSeats: number
}

export interface ComputeGravityParams {
	habitability: Float32Array<ArrayBufferLike>
	childOffset: Int32Array<ArrayBufferLike>
	childList: Int32Array<ArrayBufferLike>
	depth: Int32Array<ArrayBufferLike>
	rank: Uint8Array<ArrayBufferLike>
	provinceCount: number
}

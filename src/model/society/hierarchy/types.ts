type FanoutLevel = readonly [min: number, max: number, targetGroupSize: number]

export type FanoutRanges = readonly FanoutLevel[]

export interface PartitionMembersParams {
	seeds: Int32Array<ArrayBufferLike>
	members: Int32Array<ArrayBufferLike>
	adjOffset: Int32Array<ArrayBufferLike>
	adjList: Int32Array<ArrayBufferLike>
	provinceCount: number
	habitability?: Float32Array<ArrayBufferLike>
	urbanPop?: Float32Array<ArrayBufferLike>
	waterAccess?: Uint8Array<ArrayBufferLike>
}

export interface HierarchyProvinceScoreParams {
	province: number
	habitability: Float32Array<ArrayBufferLike>
	urbanPop: Float32Array<ArrayBufferLike>
	waterAccess: Uint8Array<ArrayBufferLike>
}

export interface BuildChildrenCSRParams {
	parent: Int32Array<ArrayBufferLike>
	provinceCount: number
}

export interface BuildSovereignParams {
	parent: Int32Array<ArrayBufferLike>
	provinceCount: number
}

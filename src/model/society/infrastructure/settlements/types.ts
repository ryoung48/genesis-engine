interface SettlementRegionWorld {
	mesh: {
		numRegions: number
		adjOffset: Int32Array
		adjList: Int32Array
		r_xyz: Float32Array
	}
	provinces?: {
		count: number
		regionProvince: Int32Array
		desolate: Uint8Array
		seeds: Int32Array
	}
	topography?: Uint8Array
	coastal: Uint8Array
	rivers?: {
		visible: Uint8Array
	}
	isLand: Uint8Array
	landmarks?: {
		regionLandmark: Int32Array
		type: Uint8Array
		size: Int32Array
	}
}

export interface SettlementAnchors {
	settlementRegions: Int32Array
	settlementWaterLandmarks: Int32Array
	settlementPortRegions: Int32Array
}

export interface GetLargestAdjacentWaterRegionParams {
	world: SettlementRegionWorld
	region: number
}

export interface InlandPriorityParams {
	world: SettlementRegionWorld
	region: number
}

export interface ComputeSettlementAnchorsParams {
	world: SettlementRegionWorld
	activeProvinceMask?: Uint8Array
}

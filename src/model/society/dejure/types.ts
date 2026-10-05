export interface DejureTitles {
	count: number
	tier: Uint8Array
	seat: Int32Array
	holder: Int32Array
	regionOf: Int32Array
}

export interface TitleMembers {
	offset: Int32Array
	list: Int32Array
}

export interface BuildDejureParams {
	adjOffset: Int32Array
	adjList: Int32Array
	active: Uint8Array
	habitability: Float32Array
	waterAccess: Uint8Array
	provinceCount: number
}

export interface ClusterUnitsParams {
	unitSize: Int32Array
	unitScore: Float32Array
	adjOffset: Int32Array
	adjList: Int32Array
	targetSize: number
	minSize: number
	maxSize: number
}

export interface ClusteredUnits {
	groupOf: Int32Array
	groupCount: number
	groupCapital: Int32Array
}

export interface UnitAdjacencyParams {
	adjOffset: Int32Array
	adjList: Int32Array
	unitOfProvince: Int32Array
	unitCount: number
}

export interface SeatScoreParams {
	province: number
	habitability: Float32Array
	urbanPop: Float32Array
	waterAccess: Uint8Array
}

export interface TitleAtParams {
	titles: DejureTitles
	provinceCount: number
	tier: number
	province: number
}

export interface TierRegionParams {
	titles: DejureTitles
	provinceCount: number
	tier: number
}

export interface MembersOfParams {
	titles: DejureTitles
	provinceCount: number
}

export interface SeatRankParams {
	titles: DejureTitles
	provinceCount: number
	heldOnly: boolean
}

export interface DistrictSeatsParams {
	titles: DejureTitles
	provinceCount: number
	rank: Uint8Array
	ownerOf: Int32Array
	members: ArrayLike<number>
	root: number
}

export interface DeriveParentsParams extends DistrictSeatsParams {
	adjOffset: Int32Array
	adjList: Int32Array
	parent: Int32Array
	district: Uint8Array
}

export interface DepthOfParentsParams {
	parent: Int32Array
}

export interface ClonedTitlesParams {
	titles: DejureTitles
	capacity: number
}

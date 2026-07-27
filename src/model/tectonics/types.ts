export interface TectonicPlate {
	id: number
	isOcean: boolean
	/** Euler pole axis [x, y, z] */
	pole: [number, number, number]
	/** Angular velocity */
	omega: number
	/** Set of region indices belonging to this plate */
	regions: Set<number>
	/** Growth rate for flood fill */
	growthRate: number
	/** Preferred growth direction [x, y, z] */
	growthDir: [number, number, number]
	/** Directional bias strength */
	dirStrength: number
}

/** Plate vector: Euler pole + angular velocity (used for coarse plate representation) */
export interface PlateVec {
	pole: [number, number, number]
	omega: number
}

/** Result of findCollisions for one plate layer */
export interface CollisionResult {
	mountain_r: Set<number>
	coastline_r: Set<number>
	ocean_r: Set<number>
	r_stress: Float32Array
	r_subductFactor: Float32Array
	r_boundaryType: Int8Array
	r_bothOcean: Uint8Array
	r_hasOcean: Uint8Array
}

export interface BoundaryInfo {
	mountain_r: Set<number>
	coastline_r: Set<number>
	ocean_r: Set<number>
	r_stress: Float32Array
	r_subductFactor: Float32Array
	r_boundaryType: Int8Array
	r_bothOcean: Uint8Array
	r_hasOcean: Uint8Array
}

export interface DistanceFields {
	distMountain: Float32Array
	distOcean: Float32Array
	distCoastline: Float32Array
	distCoast: Float32Array
	distCoastLand: Float32Array
}

export interface GenesisTerrainFeatures {
	/** Per-cell bitmask of terrain features applied during blendElevation. */
	featureMask: Uint32Array
	/** Per-cell strongest contributing feature, index into GENESIS_TERRAIN_FEATURE_LABELS. */
	dominantFeature: Uint8Array
	/** Internal helper used while later pipeline stages keep feature dominance accurate. */
	dominantMagnitude?: Float32Array
}

export interface SuperPlateData {
	r_superPlate: Int32Array
	superPlateVec: Map<number, PlateVec>
	superPlateIsOcean: Set<number>
	superPlateDensity: Map<number, number>
	numSuperPlates: number
}

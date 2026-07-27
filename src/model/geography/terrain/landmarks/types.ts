import type { SphereMesh } from "@/model/mesh/types"

export interface GenesisLandmarks {
	/** Per-region landmark index */
	regionLandmark: Int32Array
	/** Per-landmark type code (index into LANDMARK_TYPES) */
	type: Uint8Array
	/** Per-landmark region count */
	size: Int32Array
	/** Dominant culture on the landmark, or the dominant bordering culture for water landmarks */
	dominantCulture?: Int32Array
	/** Deterministic per-landmark display/name seed */
	nameSeeds?: Int32Array
	/** Real-world name per landmark (Earth import, lake landmarks only). */
	realNames?: (string | null)[]
	/** Total number of landmarks */
	count: number
}

export type LandmarkType =
	| "continent"
	| "island"
	| "isle"
	| "ocean"
	| "sea"
	| "lake"

export interface ComputeLandmarksParams {
	mesh: SphereMesh
	isLand: Uint8Array
}

export interface IncrementCountParams {
	counts: Map<number, number>
	key: number
}

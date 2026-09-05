import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"
export type LockedSSTParams = Pick<
	GenesisParams,
	| "substellarLon"
	| "eccentricity"
	| "obliquity"
	| "perihelion"
	| "planetRadiusKm"
>
export type ComputeLockedSSTParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	distCoast: Float32Array
	landmarks: GenesisLandmarks
	params: LockedSSTParams
}

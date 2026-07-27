import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface ComputeLocationsParams {
	provinces: GenesisProvinces
	mesh: SphereMesh
	seed: number
	options?: { planetRadiusKm?: number }
}

export interface GenesisLocations {
	/** Per-mesh-region location index (-1 = ocean/unassigned) */
	regionLocation: Int32Array
	/** Per-location parent province index */
	locationProvince: Int32Array
	/** Seed (capital) region for each location */
	seeds: Int32Array
	/** Number of locations */
	count: number
	/** Location adjacency — CSR offset, length count+1 */
	adjOffset: Int32Array
	/** Location adjacency — neighbor indices */
	adjList: Int32Array
	/** Per-location land region count */
	size: Int32Array
	/** Per-location RGB colors, length count*3 */
	colors: Float32Array
}

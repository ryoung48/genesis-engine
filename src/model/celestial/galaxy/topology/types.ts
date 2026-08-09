import type { GalaxyPacking } from "@/model/celestial/galaxy/packing/types"

export interface GalaxyTopologyParams {
	packing: GalaxyPacking
	seed: number
	dimensions: { w: number; h: number }
	/** Hyperlanes are routed to avoid crossing this circle around the
	 * dimensions' center, keeping a lane-free core region. */
	coreRadius: number
}

export interface GalaxyTopology {
	/** CSR row offsets into adjList, length numSystems+1. */
	adjOffset: Int32Array
	/** CSR flat neighbor indices (full Delaunay adjacency), total length
	 * adjOffset[numSystems]. */
	adjList: Int32Array
	/** Flat hyperlane pairs [a0,b0, a1,b1, …], length 2*laneCount. */
	lanes: Int32Array
	laneCount: number
}
